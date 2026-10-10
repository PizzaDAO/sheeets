/**
 * Theme-classifier eval harness (plan §13.2, Phase 1a).
 *
 * Two modes:
 *
 *   npx tsx scripts/ingest-eval.ts build-fixture [--sample-out <path>]
 *     Assembles the labeled set from the live sheet tabs (+ a local
 *     hard-negative seed) and writes it to `scripts/fixtures/ingest-eval.json`
 *     (gitignored — regenerate locally, don't commit the full set). Also
 *     writes a small stratified sample (<=50 rows) to
 *     `scripts/fixtures/ingest-eval-sample.json`, which IS committed, for
 *     unit tests. Needs no Anthropic key — only network access to the sheet
 *     (and optionally Supabase, for more conference tabs / rejected
 *     submissions; both degrade gracefully to what's reachable).
 *
 *   npx tsx scripts/ingest-eval.ts [--fixture <path>] [--limit N]
 *       [--profile <themeKey>] [--batch]
 *     Classifies the labeled set and reports precision/recall at the
 *     publish (85) and review (40) thresholds, plus a confusion summary.
 *     Requires ANTHROPIC_API_KEY (checked, never printed). Without it the
 *     script exits without making any API calls.
 *
 * Positives: each conference's own sheet tab, labeled on_theme for that
 * conference's theme profile.
 * Negatives: (a) cross-theme — other conferences' tabs scored against a
 * different theme, when more than one theme is reachable; (b) a small
 * hand-picked hard-negative seed (non-crypto generic city events);
 * (c) rejected `event_submissions` rows with off-theme reasons, when
 * Supabase credentials are available.
 *
 * Env vars:
 *   ANTHROPIC_API_KEY          required to classify (build-fixture doesn't need it)
 *   NEXT_PUBLIC_SUPABASE_URL,
 *   SUPABASE_SERVICE_ROLE_KEY  optional — more conference tabs + rejected-submission negatives
 */
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createClient } from '@supabase/supabase-js';

import { fetchEvents } from '../src/lib/fetch-events';
import { FALLBACK_TABS } from '../src/lib/conferences';
import type { TabConfig } from '../src/lib/conferences';
import type { ETHDenverEvent } from '../src/lib/types';
import { detectPlatform } from '../src/lib/event-extractors';
import { getValidLumaSlug, extractMirrorText, snapshotHosts } from '../src/lib/luma';
import { fetchLumaEvent } from '../src/lib/luma-server';
import {
  ClassifierOutputSchema,
  type ClassifierEventInput,
  type ClassifierOutput,
  type ThemeKey,
} from '../src/lib/ingest/types';
import { DEFAULT_THEME_PROFILES } from '../src/lib/ingest/profiles';
import { computeSignals, combineFinalScore, routeCandidate, type Route } from '../src/lib/ingest/signals';
import { buildSystemPrompt, buildEventDataContent } from '../src/lib/ingest/prompt';
import { CLASSIFIER_MODEL, CLASSIFIER_MAX_TOKENS, PROMPT_VERSION, classifyEvent } from '../src/lib/ingest/classifier';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const FULL_FIXTURE_PATH = path.join(FIXTURES_DIR, 'ingest-eval.json');
const SAMPLE_FIXTURE_PATH = path.join(FIXTURES_DIR, 'ingest-eval-sample.json');
const HARD_NEGATIVES_PATH = path.join(FIXTURES_DIR, 'ingest-hard-negatives.json');
const LUMA_CACHE_PATH = path.join(FIXTURES_DIR, '.ingest-eval-luma-cache.json');

const SAMPLE_SIZE = 50;
const LUMA_RATE_LIMIT_MS = 1000;
const MAX_LUMA_ENRICHMENTS = 300;

type ExampleSource = 'sheet_own_tab' | 'sheet_cross_theme' | 'hard_negative' | 'rejected_submission';

interface EvalExample {
  id: string;
  /** Conference whose theme profile this example is scored against. */
  conference: string;
  themeKey: ThemeKey;
  label: 'on_theme' | 'off_theme';
  source: ExampleSource;
  event: ClassifierEventInput;
}

interface HardNegativeSeed {
  themeKey: ThemeKey;
  name: string;
  organizer?: string;
  venue?: string;
  descriptionText?: string;
  platform?: string;
  cost?: string;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const args = {
    command: 'run' as 'run' | 'build-fixture',
    limit: undefined as number | undefined,
    profile: undefined as ThemeKey | undefined,
    batch: false,
    fixture: undefined as string | undefined,
    sampleOut: undefined as string | undefined,
  };
  const rest = [...argv];
  if (rest[0] === 'build-fixture') {
    args.command = 'build-fixture';
    rest.shift();
  }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--limit') args.limit = parseInt(rest[++i], 10);
    else if (a === '--profile') args.profile = rest[++i] as ThemeKey;
    else if (a === '--batch') args.batch = true;
    else if (a === '--fixture') args.fixture = rest[++i];
    else if (a === '--sample-out') args.sampleOut = rest[++i];
  }
  return args;
}

// ---------------------------------------------------------------------------
// Theme assignment — which theme profile a sheet tab is scored against.
// Phase 1b moves this into `ingest_profiles` (one row per conference, admin
// editable); for the eval harness today we infer it from the conference
// name, with explicit overrides for conferences we know about.
// ---------------------------------------------------------------------------

const THEME_OVERRIDES: Record<string, ThemeKey> = {
  'Paris Blockchain Week 2026': 'crypto',
  'Bitcoin Vegas': 'crypto',
  'Consensus Miami': 'crypto',
  'GDC': 'gaming',
  'SXSW': 'tech',
};

function inferThemeKey(conferenceName: string): ThemeKey {
  if (THEME_OVERRIDES[conferenceName]) return THEME_OVERRIDES[conferenceName];
  const n = conferenceName.toLowerCase();
  if (/(gdc|game dev|gaming)/.test(n)) return 'gaming';
  if (/(sxsw|south by)/.test(n)) return 'tech';
  if (/(art basel|art week|frieze)/.test(n)) return 'art';
  if (/(music|sxsw music|festival)/.test(n)) return 'music';
  if (/(ai\b|artificial intelligence)/.test(n)) return 'ai';
  if (/(crypto|blockchain|bitcoin|eth|web3|consensus|token|defi)/.test(n)) return 'crypto';
  return 'tech';
}

// ---------------------------------------------------------------------------
// Sheet event -> classifier input
// ---------------------------------------------------------------------------

function stableId(parts: (string | undefined)[]): string {
  const input = parts.filter(Boolean).join('|');
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function toClassifierInput(e: ETHDenverEvent, descriptionText?: string, hosts?: string[]): ClassifierEventInput {
  return {
    name: e.name,
    hosts: hosts && hosts.length ? hosts : e.organizer ? [e.organizer] : [],
    organizer: e.organizer || null,
    venue: e.address || null,
    dateISO: e.dateISO || null,
    startTime: e.startTime || null,
    cost: e.cost || null,
    platform: e.link ? (detectPlatform(e.link) ?? 'generic') : null,
    descriptionText: descriptionText ?? e.note ?? null,
  };
}

// ---------------------------------------------------------------------------
// Luma enrichment (optional, cached, rate-limited — §3.1 policy)
// ---------------------------------------------------------------------------

type LumaCache = Record<string, { descriptionText: string; hosts: string[] } | null>;

function loadLumaCache(): LumaCache {
  try {
    return JSON.parse(fs.readFileSync(LUMA_CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveLumaCache(cache: LumaCache) {
  fs.writeFileSync(LUMA_CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function enrichLumaLinks(events: ETHDenverEvent[]): Promise<Map<string, { descriptionText: string; hosts: string[] }>> {
  const cache = loadLumaCache();
  const out = new Map<string, { descriptionText: string; hosts: string[] }>();
  let fetched = 0;

  for (const e of events) {
    const slug = getValidLumaSlug(e.link);
    if (!slug) continue;
    if (cache[slug]) {
      out.set(e.link, cache[slug]!);
      continue;
    }
    if (cache[slug] === null) continue; // previously failed, don't retry every run
    if (fetched >= MAX_LUMA_ENRICHMENTS) continue;

    try {
      await new Promise((r) => setTimeout(r, LUMA_RATE_LIMIT_MS));
      const payload = await fetchLumaEvent({ slug });
      const descriptionText = extractMirrorText(payload.description_mirror);
      const hosts = snapshotHosts(payload)
        .map((h) => h.name)
        .filter((n): n is string => !!n);
      cache[slug] = { descriptionText, hosts };
      out.set(e.link, cache[slug]!);
      fetched++;
    } catch {
      cache[slug] = null;
    }
  }

  saveLumaCache(cache);
  return out;
}

// ---------------------------------------------------------------------------
// build-fixture
// ---------------------------------------------------------------------------

async function getTabsForFixture(): Promise<TabConfig[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return FALLBACK_TABS;
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase.from('admin_config').select('value').eq('key', 'conferences').single();
    if (error || !data?.value) return FALLBACK_TABS;
    const { conferenceToTab } = await import('../src/lib/conferences');
    const confs = data.value as { gid: number; name: string; slug: string; timezone: string; startDate: string; endDate: string; center: { lat: number; lng: number } }[];
    const tabs = confs.map(conferenceToTab);
    return tabs.length > 0 ? tabs : FALLBACK_TABS;
  } catch {
    return FALLBACK_TABS;
  }
}

async function fetchRejectedSubmissionNegatives(): Promise<EvalExample[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('event_submissions')
      .select('*')
      .eq('status', 'rejected')
      .ilike('reject_reason', '%off%theme%')
      .limit(500);
    if (error || !data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => {
      const conference = row.conference || 'Unknown';
      const themeKey = inferThemeKey(conference);
      return {
        id: `sub-${row.id}`,
        conference,
        themeKey,
        label: 'off_theme' as const,
        source: 'rejected_submission' as const,
        event: {
          name: row.name || '',
          organizer: row.organizer || null,
          venue: row.address || null,
          dateISO: row.date_iso || null,
          startTime: row.start_time || null,
          cost: row.cost || null,
          platform: row.link ? detectPlatform(row.link) ?? 'generic' : null,
          descriptionText: row.note || null,
        },
      };
    });
  } catch {
    return [];
  }
}

async function buildFixture(sampleOutOverride?: string) {
  console.log('Fetching conference tabs...');
  const tabs = await getTabsForFixture();
  console.log(`  ${tabs.length} tab(s): ${tabs.map((t) => t.name).join(', ')}`);

  console.log('Fetching sheet events for all tabs...');
  const events = await fetchEvents(undefined, tabs);
  console.log(`  ${events.length} sheet event(s)`);

  console.log('Enriching Luma links (rate-limited, cached)...');
  const enrichment = await enrichLumaLinks(events);
  console.log(`  enriched ${enrichment.size} link(s) (cache: ${LUMA_CACHE_PATH})`);

  const eventsByTheme = new Map<ThemeKey, ETHDenverEvent[]>();
  for (const e of events) {
    const theme = inferThemeKey(e.conference);
    eventsByTheme.set(theme, [...(eventsByTheme.get(theme) ?? []), e]);
  }

  const examples: EvalExample[] = [];

  // Positives: each conference's own tab, scored against its own theme.
  for (const e of events) {
    const themeKey = inferThemeKey(e.conference);
    const enriched = enrichment.get(e.link);
    examples.push({
      id: `pos-${stableId([e.conference, e.dateISO, e.startTime, e.name])}`,
      conference: e.conference,
      themeKey,
      label: 'on_theme',
      source: 'sheet_own_tab',
      event: toClassifierInput(e, enriched?.descriptionText, enriched?.hosts),
    });
  }

  // Cross-theme negatives: events from a *different* theme's tab, scored
  // against each conference whose tab theme differs. Reported separately
  // because it's an easy negative (§13.2 (a)). Only non-empty once more than
  // one theme is reachable (needs Supabase-configured non-crypto tabs).
  const conferencesSeen = Array.from(new Set(events.map((e) => e.conference)));
  for (const conference of conferencesSeen) {
    const targetTheme = inferThemeKey(conference);
    for (const [theme, themeEvents] of eventsByTheme) {
      if (theme === targetTheme) continue;
      for (const e of themeEvents) {
        const enriched = enrichment.get(e.link);
        examples.push({
          id: `xneg-${stableId([conference, e.conference, e.dateISO, e.startTime, e.name])}`,
          conference,
          themeKey: targetTheme,
          label: 'off_theme',
          source: 'sheet_cross_theme',
          event: toClassifierInput(e, enriched?.descriptionText, enriched?.hosts),
        });
      }
    }
  }
  if (eventsByTheme.size <= 1) {
    console.log(
      '  only one theme reachable from current tabs — cross-theme negatives are empty. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY to pull additional ' +
        'non-crypto conference tabs (e.g. GDC, SXSW) for a stronger cross-theme set.'
    );
  }

  // Hard negatives: hand-picked seed, applied to every conference sharing that theme.
  const hardNegatives: HardNegativeSeed[] = JSON.parse(fs.readFileSync(HARD_NEGATIVES_PATH, 'utf8'));
  for (const conference of conferencesSeen) {
    const targetTheme = inferThemeKey(conference);
    for (const hn of hardNegatives.filter((h) => h.themeKey === targetTheme)) {
      examples.push({
        id: `hneg-${stableId([conference, hn.name])}`,
        conference,
        themeKey: targetTheme,
        label: 'off_theme',
        source: 'hard_negative',
        event: {
          name: hn.name,
          organizer: hn.organizer ?? null,
          venue: hn.venue ?? null,
          cost: hn.cost ?? null,
          platform: hn.platform ?? null,
          descriptionText: hn.descriptionText ?? null,
        },
      });
    }
  }

  // Rejected submissions (needs Supabase; empty otherwise).
  const rejected = await fetchRejectedSubmissionNegatives();
  examples.push(...rejected);

  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.writeFileSync(FULL_FIXTURE_PATH, JSON.stringify(examples, null, 2));
  console.log(`Wrote ${examples.length} example(s) to ${FULL_FIXTURE_PATH} (gitignored).`);

  const bySource = new Map<ExampleSource, number>();
  for (const ex of examples) bySource.set(ex.source, (bySource.get(ex.source) ?? 0) + 1);
  console.log('  by source:', Object.fromEntries(bySource));

  const sample = stratifiedSample(examples, SAMPLE_SIZE);
  const sampleOut = sampleOutOverride ?? SAMPLE_FIXTURE_PATH;
  fs.writeFileSync(sampleOut, JSON.stringify(sample, null, 2));
  console.log(`Wrote a ${sample.length}-row sample to ${sampleOut} (commit this one).`);
}

/** Deterministic stratified sample across label x source, capped at `size`. */
function stratifiedSample(examples: EvalExample[], size: number): EvalExample[] {
  const groups = new Map<string, EvalExample[]>();
  for (const ex of examples) {
    const key = `${ex.label}:${ex.source}`;
    groups.set(key, [...(groups.get(key) ?? []), ex]);
  }
  const keys = Array.from(groups.keys()).sort();
  const perGroup = Math.max(1, Math.floor(size / Math.max(1, keys.length)));
  const out: EvalExample[] = [];
  for (const key of keys) {
    const items = groups.get(key)!.slice().sort((a, b) => a.id.localeCompare(b.id));
    out.push(...items.slice(0, perGroup));
    if (out.length >= size) break;
  }
  return out.slice(0, size);
}

// ---------------------------------------------------------------------------
// Classify + report
// ---------------------------------------------------------------------------

interface ScoredExample {
  example: EvalExample;
  output: ClassifierOutput | null;
  finalScore: number | null;
  route: Route | null;
  error?: string;
  inputTokens: number;
  outputTokens: number;
}

function profileFor(themeKey: ThemeKey) {
  if (themeKey === 'custom') return DEFAULT_THEME_PROFILES.tech;
  return DEFAULT_THEME_PROFILES[themeKey];
}

async function classifySync(client: Anthropic, examples: EvalExample[]): Promise<ScoredExample[]> {
  const out: ScoredExample[] = [];
  for (const example of examples) {
    const profile = profileFor(example.themeKey);
    try {
      const result = await classifyEvent({
        client,
        profile,
        conference: { name: example.conference },
        event: example.event,
      });
      const signals = computeSignals({
        text: `${example.event.name} ${(example.event.hosts ?? []).join(' ')} ${example.event.organizer ?? ''} ${example.event.descriptionText ?? ''}`,
        includeKeywords: profile.includeKeywords,
        excludeKeywords: profile.excludeKeywords,
        injectionDetected: result.injectionDetected,
      });
      const finalScore = combineFinalScore(result.output.score, signals);
      const route = routeCandidate({ isEvent: result.output.is_event, llmScore: result.output.score, signals, profile });
      out.push({ example, output: result.output, finalScore, route, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
    } catch (err) {
      out.push({ example, output: null, finalScore: null, route: null, error: String(err), inputTokens: 0, outputTokens: 0 });
    }
  }
  return out;
}

async function classifyViaBatch(client: Anthropic, examples: EvalExample[]): Promise<ScoredExample[]> {
  const requests = examples.map((example) => {
    const profile = profileFor(example.themeKey);
    const system = buildSystemPrompt(profile, { name: example.conference });
    const userContent = buildEventDataContent(example.event);
    return {
      custom_id: example.id,
      params: {
        model: CLASSIFIER_MODEL,
        max_tokens: CLASSIFIER_MAX_TOKENS,
        temperature: 0,
        system,
        messages: [{ role: 'user' as const, content: userContent }],
        output_config: { format: zodOutputFormat(ClassifierOutputSchema) },
      },
    };
  });

  console.log(`Submitting a batch of ${requests.length} request(s)...`);
  const batch = await client.messages.batches.create({ requests });
  console.log(`  batch ${batch.id}, polling until done (checks every 20s)...`);

  let current = batch;
  while (current.processing_status !== 'ended') {
    await new Promise((r) => setTimeout(r, 20_000));
    current = await client.messages.batches.retrieve(batch.id);
    console.log(`  status=${current.processing_status} counts=${JSON.stringify(current.request_counts)}`);
  }

  const byId = new Map(examples.map((e) => [e.id, e]));
  const out: ScoredExample[] = [];
  for await (const result of await client.messages.batches.results(batch.id)) {
    const example = byId.get(result.custom_id);
    if (!example) continue;
    if (result.result.type !== 'succeeded') {
      out.push({ example, output: null, finalScore: null, route: null, error: result.result.type, inputTokens: 0, outputTokens: 0 });
      continue;
    }
    const message = result.result.message;
    const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    const profile = profileFor(example.themeKey);
    try {
      const parsed = ClassifierOutputSchema.parse(JSON.parse(textBlock?.text ?? ''));
      const signals = computeSignals({
        text: `${example.event.name} ${(example.event.hosts ?? []).join(' ')} ${example.event.organizer ?? ''} ${example.event.descriptionText ?? ''}`,
        includeKeywords: profile.includeKeywords,
        excludeKeywords: profile.excludeKeywords,
      });
      const finalScore = combineFinalScore(parsed.score, signals);
      const route = routeCandidate({ isEvent: parsed.is_event, llmScore: parsed.score, signals, profile });
      out.push({
        example,
        output: parsed,
        finalScore,
        route,
        inputTokens: message.usage?.input_tokens ?? 0,
        outputTokens: message.usage?.output_tokens ?? 0,
      });
    } catch (err) {
      out.push({ example, output: null, finalScore: null, route: null, error: `parse: ${String(err)}`, inputTokens: 0, outputTokens: 0 });
    }
  }
  return out;
}

function metricsAtThreshold(scored: ScoredExample[], threshold: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const s of scored) {
    if (s.finalScore == null) continue;
    const predictedOnTheme = s.finalScore >= threshold;
    const actualOnTheme = s.example.label === 'on_theme';
    if (predictedOnTheme && actualOnTheme) tp++;
    else if (predictedOnTheme && !actualOnTheme) fp++;
    else if (!predictedOnTheme && actualOnTheme) fn++;
    else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  return { tp, fp, fn, tn, precision, recall };
}

function printReport(scored: ScoredExample[], usedBatch: boolean) {
  const errors = scored.filter((s) => s.error);
  const ok = scored.filter((s) => !s.error);

  console.log('\n=== Theme classifier eval report ===');
  console.log(`examples: ${scored.length}  classified: ${ok.length}  errors: ${errors.length}`);

  for (const threshold of [85, 40]) {
    const m = metricsAtThreshold(ok, threshold);
    console.log(
      `\nThreshold ${threshold}: precision=${fmtPct(m.precision)} recall=${fmtPct(m.recall)} ` +
        `(tp=${m.tp} fp=${m.fp} fn=${m.fn} tn=${m.tn})`
    );
  }

  console.log('\nConfusion by route x label:');
  const routes: Route[] = ['publish', 'review', 'reject'];
  const labels: ('on_theme' | 'off_theme')[] = ['on_theme', 'off_theme'];
  for (const route of routes) {
    const row = labels.map((label) => ok.filter((s) => s.route === route && s.example.label === label).length);
    console.log(`  ${route.padEnd(8)} on_theme=${row[0]}  off_theme=${row[1]}`);
  }

  const inputTokens = ok.reduce((sum, s) => sum + s.inputTokens, 0);
  const outputTokens = ok.reduce((sum, s) => sum + s.outputTokens, 0);
  const rate = usedBatch ? { in: 0.5, out: 2.5 } : { in: 1, out: 5 }; // $/MTok, Haiku 4.5 (§12)
  const cost = (inputTokens / 1e6) * rate.in + (outputTokens / 1e6) * rate.out;
  console.log(`\nTokens: ${inputTokens} in / ${outputTokens} out. Estimated cost: $${cost.toFixed(4)} (${usedBatch ? 'batch' : 'sync'} pricing).`);

  if (errors.length > 0) {
    console.log(`\n${errors.length} error(s), e.g.:`);
    for (const e of errors.slice(0, 5)) console.log(`  [${e.example.id}] ${e.error}`);
  }
}

function fmtPct(v: number | null): string {
  return v == null ? 'n/a' : `${(v * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'build-fixture') {
    await buildFixture(args.sampleOut);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      'ANTHROPIC_API_KEY is not set (checked process.env; also check .env.local if you use one). ' +
        'Not making any API calls. Set the key and re-run to classify and get a precision/recall report.'
    );
    return;
  }

  const fixturePath = args.fixture ?? (fs.existsSync(FULL_FIXTURE_PATH) ? FULL_FIXTURE_PATH : SAMPLE_FIXTURE_PATH);
  if (!fs.existsSync(fixturePath)) {
    console.log(
      `No fixture found at ${fixturePath}. Run "npx tsx scripts/ingest-eval.ts build-fixture" first.`
    );
    return;
  }
  console.log(`Loading examples from ${fixturePath}${fixturePath === SAMPLE_FIXTURE_PATH ? ' (committed sample — run build-fixture for the full set)' : ''}...`);
  let examples: EvalExample[] = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  if (args.profile) examples = examples.filter((e) => e.themeKey === args.profile);
  if (args.limit) examples = examples.slice(0, args.limit);
  console.log(`Classifying ${examples.length} example(s) with prompt_version=${PROMPT_VERSION}, model=${CLASSIFIER_MODEL}...`);

  const client = new Anthropic({ apiKey });
  const scored = args.batch ? await classifyViaBatch(client, examples) : await classifySync(client, examples);
  printReport(scored, args.batch);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
