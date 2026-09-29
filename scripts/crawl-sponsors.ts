/**
 * Sponsor crawling script
 *
 * Crawls event URLs from Google Sheets and extracts sponsor/partner information
 * using platform APIs, HTML section detection, and description text mining.
 * Results are stored in Supabase (event_sponsors + sponsor_crawl_log tables).
 *
 * Usage:
 *   npx tsx scripts/crawl-sponsors.ts [options]
 *
 * Options:
 *   --conference <name>   Only crawl events from the named conference
 *   --force               Re-crawl URLs already in the crawl log
 *   --dry-run             Extract sponsors but don't write to Supabase
 *   --concurrency <n>     Max parallel crawls (default: 1)
 *   --skip-ai             Disable AI extraction (Layers 1-2 only)
 *   --cleanup-description Delete all extraction_method='description' rows before crawling
 *
 * Env vars:
 *   NEXT_PUBLIC_SUPABASE_URL   Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  Supabase service role key
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FALLBACK_TABS } from '../src/lib/conferences';
import { getActiveConferences, conferenceToTab } from '../src/lib/conferences';
import { fetchEvents } from '../src/lib/fetch-events';
import type { TabConfig } from '../src/lib/conferences';
import type { ConferenceConfig, ETHDenverEvent } from '../src/lib/types';
import OpenAI from 'openai';
import {
  detectPlatform,
  fetchHtml,
  getLumaSlug,
  fetchLumaApi,
  extractSponsorsFromLuma,
  extractSponsorsFromHtml,
  type ExtractedSponsor,
} from '../src/lib/sponsor-extraction';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  conference: string | null;
  force: boolean;
  dryRun: boolean;
  concurrency: number;
  skipAI: boolean;
  cleanupDescription: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    conference: null,
    force: false,
    dryRun: false,
    concurrency: 1,
    skipAI: false,
    cleanupDescription: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--conference':
        result.conference = args[++i] || null;
        break;
      case '--force':
        result.force = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--concurrency':
        result.concurrency = Math.max(1, parseInt(args[++i] || '1', 10));
        break;
      case '--skip-ai':
        result.skipAI = true;
        break;
      case '--cleanup-description':
        result.cleanupDescription = true;
        break;
      default:
        console.warn(`Unknown argument: ${args[i]}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Supabase setup
// ---------------------------------------------------------------------------

function createSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Fetch conference tabs (from Supabase or fallback)
// ---------------------------------------------------------------------------

async function fetchConferenceTabs(supabase: SupabaseClient): Promise<TabConfig[]> {
  try {
    const { data, error } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'conferences')
      .single();

    if (error || !data?.value) {
      console.log('No conferences config in Supabase, using FALLBACK_TABS');
      return FALLBACK_TABS;
    }

    const allConfs = data.value as ConferenceConfig[];
    const active = getActiveConferences(allConfs);
    const tabs = active.map(conferenceToTab);
    return tabs.length > 0 ? tabs : FALLBACK_TABS;
  } catch (err) {
    console.log('Failed to fetch from Supabase:', err);
    return FALLBACK_TABS;
  }
}

// ---------------------------------------------------------------------------
// Rate limiting helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  fn: () => Promise<string>,
  url: string,
): Promise<string> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // 404/410: no retry
      if (message.includes('HTTP 404') || message.includes('HTTP 410')) {
        throw err;
      }

      // 429: exponential backoff
      if (message.includes('HTTP 429') && attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`  429 rate limited, backing off ${backoffMs / 1000}s...`);
        await delay(backoffMs);
        continue;
      }

      // 5xx: single retry after 2s
      if (/HTTP 5\d{2}/.test(message) && attempt === 0) {
        console.log(`  5xx error, retrying in 2s...`);
        await delay(2000);
        continue;
      }

      throw err;
    }
  }

  throw new Error(`Max retries exceeded for ${url}`);
}

// ---------------------------------------------------------------------------
// Crawl a single event URL
// ---------------------------------------------------------------------------

interface CrawlResult {
  sponsors: ExtractedSponsor[];
  status: 'success' | 'no_sponsors' | 'error' | 'skipped';
  error?: string;
}

async function crawlEventUrl(url: string, openaiClient?: OpenAI): Promise<CrawlResult> {
  const platform = detectPlatform(url);

  try {
    let sponsors: ExtractedSponsor[];

    if (platform === 'luma') {
      // Use Luma API
      const slug = getLumaSlug(url);
      if (!slug) {
        return { sponsors: [], status: 'error', error: 'Invalid Luma URL' };
      }

      const apiData = await fetchWithRetry(
        async () => {
          const data = await fetchLumaApi(slug);
          return JSON.stringify(data);
        },
        url,
      );

      sponsors = await extractSponsorsFromLuma(JSON.parse(apiData), openaiClient);

      // Also fetch HTML for additional sponsor mentions
      try {
        const html = await fetchWithRetry(() => fetchHtml(url), url);
        const htmlSponsors = await extractSponsorsFromHtml(html, url, openaiClient);
        // Merge, dedup handled by the extraction layer
        const existingNames = new Set(sponsors.map((s) => s.sponsor_name.toLowerCase()));
        for (const hs of htmlSponsors) {
          if (!existingNames.has(hs.sponsor_name.toLowerCase())) {
            sponsors.push(hs);
          }
        }
      } catch {
        // HTML fetch failure is not critical for Luma (we already have API data)
      }
    } else {
      // HTML-based extraction for all other platforms
      const html = await fetchWithRetry(() => fetchHtml(url), url);
      sponsors = await extractSponsorsFromHtml(html, url, openaiClient);
    }

    if (sponsors.length === 0) {
      return { sponsors: [], status: 'no_sponsors' };
    }

    return { sponsors, status: 'success' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sponsors: [], status: 'error', error: message };
  }
}

// ---------------------------------------------------------------------------
// Supabase write helpers
// ---------------------------------------------------------------------------

async function upsertSponsors(
  supabase: SupabaseClient,
  event: ETHDenverEvent,
  sponsors: ExtractedSponsor[],
): Promise<void> {
  const rows = sponsors.map((s) => ({
    event_id: event.id,
    event_name: event.name,
    event_url: event.link,
    conference: event.conference,
    sponsor_name: s.sponsor_name,
    sponsor_url: s.sponsor_url,
    sponsor_logo_url: s.sponsor_logo_url,
    sponsor_type: s.sponsor_type,
    confidence: s.confidence,
    extraction_method: s.extraction_method,
    crawled_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('event_sponsors')
    .upsert(rows, { onConflict: 'event_id,sponsor_name' });

  if (error) {
    console.error(`  Supabase upsert error for ${event.id}: ${error.message}`);
  }
}

async function updateCrawlLog(
  supabase: SupabaseClient,
  event: ETHDenverEvent,
  result: CrawlResult,
): Promise<void> {
  const { error } = await supabase
    .from('sponsor_crawl_log')
    .upsert({
      event_url: event.link,
      event_id: event.id,
      conference: event.conference,
      status: result.status,
      sponsors_found: result.sponsors.length,
      error_message: result.error || null,
      crawled_at: new Date().toISOString(),
    }, { onConflict: 'event_url' });

  if (error) {
    console.error(`  Crawl log error for ${event.link}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  console.log('=== Sponsor Crawling Script ===');
  console.log(`  Conference filter: ${args.conference || 'all'}`);
  console.log(`  Force re-crawl: ${args.force}`);
  console.log(`  Dry run: ${args.dryRun}`);
  console.log(`  Concurrency: ${args.concurrency}`);
  console.log('');

  // Init OpenAI client for AI-powered sponsor extraction
  let openaiClient: OpenAI | undefined;
  if (!args.skipAI && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log(`  AI extraction: enabled (GPT-4o-mini)`);
  } else {
    console.log(`  AI extraction: disabled${args.skipAI ? ' (--skip-ai)' : ' (no OPENAI_API_KEY)'}`);
  }
  console.log('');

  // 1. Create Supabase client (required even for dry-run to fetch tabs + crawl log)
  const supabase = createSupabaseClient();

  // 2. Fetch active conference tabs
  const allTabs = await fetchConferenceTabs(supabase);
  let tabs = allTabs;

  if (args.conference) {
    tabs = allTabs.filter(
      (t) =>
        t.name.toLowerCase().includes(args.conference!.toLowerCase()) ||
        t.slug.toLowerCase() === args.conference!.toLowerCase()
    );
    if (tabs.length === 0) {
      console.error(`No conference matching "${args.conference}". Available: ${allTabs.map((t) => t.name).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`Using ${tabs.length} conference tab(s): ${tabs.map((t) => t.name).join(', ')}`);

  // 3. Fetch all events from Google Sheets
  console.log('Fetching events from Google Sheets...');
  const allEvents = await fetchEvents(undefined, tabs);
  console.log(`  Total events: ${allEvents.length}`);

  // 4. Filter to events with non-empty link fields
  const eventsWithLinks = allEvents.filter((e) => {
    if (!e.link) return false;
    try {
      new URL(e.link);
      return true;
    } catch {
      return false;
    }
  });
  console.log(`  Events with valid links: ${eventsWithLinks.length}`);

  // 4b. Deduplicate events by URL (same URL can appear in multiple sheet rows)
  const seenUrls = new Set<string>();
  const uniqueEvents = eventsWithLinks.filter((e) => {
    if (seenUrls.has(e.link)) return false;
    seenUrls.add(e.link);
    return true;
  });
  console.log(`  Unique event URLs: ${uniqueEvents.length} (deduped ${eventsWithLinks.length - uniqueEvents.length})`);

  // 5. Check crawl log — skip already-crawled (unless --force)
  let eventsToCrawl = uniqueEvents;

  if (!args.force) {
    const { data: crawlLog } = await supabase
      .from('sponsor_crawl_log')
      .select('event_url')
      .in('event_url', uniqueEvents.map((e) => e.link));

    const crawledUrls = new Set((crawlLog || []).map((r: { event_url: string }) => r.event_url));
    eventsToCrawl = uniqueEvents.filter((e) => !crawledUrls.has(e.link));
    console.log(`  Already crawled: ${crawledUrls.size}`);
  }

  console.log(`  To crawl: ${eventsToCrawl.length}`);
  console.log('');

  // Cleanup: delete garbage Layer 3 (description) rows if requested
  if (args.cleanupDescription && !args.dryRun) {
    console.log('Cleaning up description-method sponsor rows...');
    const { count, error } = await supabase
      .from('event_sponsors')
      .delete({ count: 'exact' })
      .eq('extraction_method', 'description');

    if (error) {
      console.error(`  Cleanup error: ${error.message}`);
    } else {
      console.log(`  Deleted ${count ?? 'unknown number of'} description rows`);
    }
    console.log('');
  }

  if (eventsToCrawl.length === 0) {
    console.log('Nothing to crawl. Use --force to re-crawl.');
    return;
  }

  // 6. Crawl each URL
  let totalCrawled = 0;
  let totalSponsorsFound = 0;
  let totalErrors = 0;
  let totalNoSponsors = 0;

  for (let i = 0; i < eventsToCrawl.length; i++) {
    const event = eventsToCrawl[i];
    const progress = `[${i + 1}/${eventsToCrawl.length}]`;

    console.log(`${progress} ${event.name}`);
    console.log(`  URL: ${event.link}`);
    console.log(`  Platform: ${detectPlatform(event.link)}`);

    const result = await crawlEventUrl(event.link, openaiClient);
    totalCrawled++;

    switch (result.status) {
      case 'success':
        console.log(`  Found ${result.sponsors.length} sponsor(s):`);
        for (const s of result.sponsors) {
          console.log(`    - ${s.sponsor_name} (${s.sponsor_type}, ${s.confidence}, ${s.extraction_method})`);
        }
        totalSponsorsFound += result.sponsors.length;
        break;
      case 'no_sponsors':
        console.log('  No sponsors found');
        totalNoSponsors++;
        break;
      case 'error':
        console.log(`  Error: ${result.error}`);
        totalErrors++;
        break;
    }

    // Write to Supabase (unless dry run)
    if (!args.dryRun) {
      if (result.sponsors.length > 0) {
        await upsertSponsors(supabase, event, result.sponsors);
      }
      await updateCrawlLog(supabase, event, result);
    }

    // Rate limit: 500ms between requests
    if (i < eventsToCrawl.length - 1) {
      await delay(500);
    }
  }

  // 7. Summary
  console.log('');
  console.log('=== Summary ===');
  console.log(`  Total crawled: ${totalCrawled}`);
  console.log(`  Sponsors found: ${totalSponsorsFound}`);
  console.log(`  No sponsors: ${totalNoSponsors}`);
  console.log(`  Errors: ${totalErrors}`);
  if (args.dryRun) {
    console.log('  (Dry run — no data written to Supabase)');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
