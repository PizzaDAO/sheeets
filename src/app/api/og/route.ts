import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseBody, OgBatchSchema } from '@/lib/api-validation';
import { safeFetch } from '@/lib/safe-fetch';
import { getEventLinkById } from '@/lib/fetch-events-cached';

// safeFetch relies on node:http/node:dns for SSRF protection
export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Read-only client using anon key (respects RLS) */
function getSupabaseReader() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

/** Write client using service role key (bypasses RLS) */
function getSupabaseWriter() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/** In-memory fallback cache for when Supabase is unavailable */
const memoryCache = new Map<string, { imageUrl: string | null; ts: number }>();
const MEMORY_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

/** Extract the slug from a Luma URL (lu.ma/xxx or luma.com/xxx) */
function getLumaSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'lu.ma' || u.hostname === 'luma.com' || u.hostname === 'www.luma.com') {
      const slug = u.pathname.replace(/^\//, '').split('/')[0];
      return slug || null;
    }
  } catch {}
  return null;
}

/** Fetch cover image from Luma API */
async function fetchLumaImage(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.lu.ma/url?url=${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    if (data.kind === 'event') {
      return data.data?.event?.cover_url || null;
    }
    if (data.kind === 'calendar') {
      return data.data?.calendar?.cover_image_url || null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Decode common HTML entities in an extracted attribute value */
function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/** Check whether a URL points to Eventbrite */
function isEventbriteUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.startsWith('eventbrite.');
  } catch {
    return false;
  }
}

/**
 * Extract an event image from JSON-LD structured data in HTML.
 * Eventbrite embeds `<script type="application/ld+json">` with an Event
 * schema that contains the canonical event image. This is the same proven
 * approach used in `fetch-event/route.ts` (`parseJsonLdEvent`).
 */
function extractJsonLdImage(html: string): string | null {
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      const items = Array.isArray(json) ? json : [json];

      for (const item of items) {
        const candidates = item['@graph'] ? [...item['@graph'], item] : [item];

        for (const candidate of candidates) {
          const type = candidate['@type'];
          const isEvent =
            type === 'Event' ||
            type === 'SocialEvent' ||
            (Array.isArray(type) &&
              (type.includes('Event') || type.includes('SocialEvent')));

          if (!isEvent) continue;

          if (candidate.image && typeof candidate.image === 'string') {
            return candidate.image;
          }
        }
      }
    } catch {
      // Ignore invalid JSON blocks
    }
  }

  return null;
}

/**
 * Fetch the event image from an Eventbrite URL.
 *
 * Eventbrite pages are server-rendered React apps where the JSON-LD Event
 * schema lives in the <body>, not the <head>. The generic 50KB head-only
 * scrape therefore misses both the JSON-LD image *and* the og:image (which
 * Eventbrite often renders as a relative `/_next/image?...` URL that
 * resolves to a low-quality placeholder). Fetching the full HTML and
 * extracting the JSON-LD image yields the high-quality canonical image.
 */
async function fetchEventbriteImage(url: string): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SheetsEventBot/1.0; +https://sheeets.com)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) return null;

    const html = res.text;

    // 1. Try JSON-LD image first (proven reliable for Eventbrite)
    const jsonLdImage = extractJsonLdImage(html);
    if (jsonLdImage) {
      let imageUrl = decodeHTMLEntities(jsonLdImage);
      // Resolve relative URLs
      if (imageUrl.startsWith('/')) {
        try {
          imageUrl = new URL(imageUrl, url).href;
        } catch {}
      }
      return imageUrl;
    }

    // 2. Fall back to og:image from the full HTML
    const ogMatch =
      html.match(
        /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i
      );

    if (ogMatch?.[1]) {
      let imageUrl = decodeHTMLEntities(ogMatch[1]);
      if (imageUrl.startsWith('/')) {
        try {
          imageUrl = new URL(imageUrl, url).href;
        } catch {}
      }
      return imageUrl;
    }

    return null;
  } catch {
    return null;
  }
}

/** Resolve an image URL from a source URL (Luma API, Eventbrite, or og:image scraping) */
async function resolveImageUrl(url: string): Promise<string | null> {
  // Luma: use their API for clean cover images
  const lumaSlug = getLumaSlug(url);
  if (lumaSlug) {
    return fetchLumaImage(lumaSlug);
  }

  // Eventbrite: fetch full HTML and extract JSON-LD image
  if (isEventbriteUrl(url)) {
    return fetchEventbriteImage(url);
  }

  // Generic: fetch HTML and extract og:image
  try {
    // Only read the first 50KB (or up to </head>) to find og:image
    const res = await safeFetch(url, {
      timeoutMs: 5000,
      maxBytes: 50000,
      stopWhen: (text) => text.includes('</head>'),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; sheeets-bot/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!res.ok) return null;

    const html = res.text;

    // Extract og:image (handle both attribute orderings)
    const ogMatch = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
    ) || html.match(
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i
    );

    if (!ogMatch?.[1]) return null;

    let imageUrl = decodeHTMLEntities(ogMatch[1]);

    // Resolve relative URLs
    if (imageUrl.startsWith('/')) {
      try {
        const origin = new URL(url).origin;
        imageUrl = `${origin}${imageUrl}`;
      } catch {}
    }

    return imageUrl;
  } catch {
    return null;
  }
}

/** Normalize a URL for equality comparison */
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  try {
    return new URL(trimmed).href;
  } catch {
    return trimmed;
  }
}

/**
 * Resolve the canonical source URL for an event from server-side data.
 * - 'not-found': no event with this ID (or lookup failed)
 * - 'mismatch':  the client-supplied URL is not the event's link
 * Otherwise returns the event's canonical link.
 */
async function resolveEventLink(
  eventId: string,
  clientUrl: string
): Promise<{ link: string } | 'not-found' | 'mismatch'> {
  let link: string | undefined;
  try {
    link = await getEventLinkById(eventId);
  } catch {
    return 'not-found';
  }
  if (!link) return 'not-found';
  if (normalizeUrl(link) !== normalizeUrl(clientUrl)) return 'mismatch';
  return { link: link.trim() };
}

export async function GET(request: NextRequest) {
  const clientUrl = request.nextUrl.searchParams.get('url');
  const eventId = request.nextUrl.searchParams.get('eventId');

  if (!clientUrl) {
    return NextResponse.json({ imageUrl: null }, { status: 400 });
  }

  // 1. Check Supabase cache (if eventId provided)
  if (eventId && supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = getSupabaseReader();
      const { data } = await supabase
        .from('event_images')
        .select('image_url')
        .eq('event_id', eventId)
        .single();

      if (data) {
        return NextResponse.json(
          { imageUrl: data.image_url },
          { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } }
        );
      }
    } catch {
      // Supabase unavailable, fall through to resolution
    }
  }

  // 2. Verify the client URL against the event's canonical link. Only a
  //    verified eventId may be persisted to the shared event_images cache.
  let url = clientUrl;
  let persist = false;
  if (eventId) {
    const resolved = await resolveEventLink(eventId, clientUrl);
    if (resolved === 'mismatch') {
      return NextResponse.json({ imageUrl: null }, { status: 400 });
    }
    if (resolved !== 'not-found') {
      url = resolved.link;
      persist = true;
    }
  }

  // 3. Check in-memory cache (fallback / no eventId)
  const memCached = memoryCache.get(url);
  if (memCached && Date.now() - memCached.ts < MEMORY_CACHE_TTL) {
    return NextResponse.json({ imageUrl: memCached.imageUrl });
  }

  // 4. Resolve the image URL from source
  const imageUrl = await resolveImageUrl(url);

  // 5. Store in Supabase cache (only for verified events)
  if (persist && eventId && supabaseUrl && supabaseServiceKey) {
    try {
      const supabase = getSupabaseWriter();
      await supabase
        .from('event_images')
        .upsert(
          {
            event_id: eventId,
            source_url: url,
            image_url: imageUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'event_id' }
        );
    } catch {
      // Supabase write failed, still return the resolved URL
    }
  }

  // 6. Store in memory cache as fallback
  memoryCache.set(url, { imageUrl, ts: Date.now() });

  return NextResponse.json({ imageUrl });
}

/** Batch endpoint: resolve and cache multiple event images at once */
export async function POST(request: NextRequest) {
  try {
    const { data, error } = await parseBody(request, OgBatchSchema);
    if (error) return error;

    const { items } = data;

    // Limit batch size
    const batch = items.slice(0, 20);
    const eventIds = batch.map((item) => item.eventId);

    // Check Supabase for existing cached images
    const results: Record<string, string | null> = {};
    const uncached: { eventId: string; url: string }[] = [];

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = getSupabaseReader();
        const { data } = await supabase
          .from('event_images')
          .select('event_id, image_url')
          .in('event_id', eventIds);

        const cachedMap = new Map(
          (data || []).map((row) => [row.event_id, row.image_url])
        );

        for (const item of batch) {
          if (cachedMap.has(item.eventId)) {
            results[item.eventId] = cachedMap.get(item.eventId) ?? null;
          } else {
            uncached.push(item);
          }
        }
      } catch {
        // Supabase unavailable, resolve all
        uncached.push(...batch);
      }
    } else {
      uncached.push(...batch);
    }

    // Only resolve items whose URL matches the event's canonical link;
    // unknown or mismatched items get null and are never persisted.
    const verified: { eventId: string; url: string }[] = [];
    for (const item of uncached) {
      const resolved = await resolveEventLink(item.eventId, item.url);
      if (typeof resolved === 'object') {
        verified.push({ eventId: item.eventId, url: resolved.link });
      } else {
        results[item.eventId] = null;
      }
    }

    // Resolve verified images in parallel (max 5 concurrent)
    const CONCURRENCY = 5;
    for (let i = 0; i < verified.length; i += CONCURRENCY) {
      const chunk = verified.slice(i, i + CONCURRENCY);
      const resolved = await Promise.all(
        chunk.map(async (item) => {
          const imageUrl = await resolveImageUrl(item.url);
          return { eventId: item.eventId, url: item.url, imageUrl };
        })
      );

      for (const r of resolved) {
        results[r.eventId] = r.imageUrl;
      }

      // Batch upsert to Supabase
      if (supabaseUrl && supabaseServiceKey) {
        try {
          const supabase = getSupabaseWriter();
          await supabase.from('event_images').upsert(
            resolved.map((r) => ({
              event_id: r.eventId,
              source_url: r.url,
              image_url: r.imageUrl,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'event_id' }
          );
        } catch {
          // Supabase write failed, still return results
        }
      }
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: {} }, { status: 500 });
  }
}
