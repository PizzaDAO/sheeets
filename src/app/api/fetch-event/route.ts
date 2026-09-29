import { NextRequest, NextResponse } from 'next/server';
import { parseBody, FetchEventSchema } from '@/lib/api-validation';
import { safeFetch, SafeFetchError } from '@/lib/safe-fetch';

// safeFetch relies on node:http/node:dns for SSRF protection
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Error whose message is safe to return to the client */
class UserFacingError extends Error {}

/** Format an ISO date string as "YYYY-MM-DD" in the given timezone */
function formatDateISO(isoDate: string, timezone: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    const parts = d.toLocaleDateString('en-CA', { timeZone: timezone }).split('-');
    return parts.join('-');
  } catch {
    return '';
  }
}

/** Format an ISO date string as "HH:mm" (24h) in the given timezone */
function formatTime24(isoDate: string, timezone: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
  } catch {
    return '';
  }
}

/** Parse cost from cents integer */
function formatCost(priceCents: number | null | undefined): string {
  if (!priceCents || priceCents === 0) return 'Free';
  const dollars = priceCents / 100;
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

/** Try to guess a timezone from an ISO 8601 offset like "+05:30" or "-06:00".
 *  Returns a representative IANA timezone or the provided default. */
function guessTimezoneFromOffset(isoDate: string, fallback: string): string {
  // Common offset -> IANA timezone mapping (covers major US/EU/Asia offsets)
  const offsetMap: Record<string, string> = {
    '-12:00': 'Etc/GMT+12',
    '-11:00': 'Pacific/Pago_Pago',
    '-10:00': 'Pacific/Honolulu',
    '-09:00': 'America/Anchorage',
    '-08:00': 'America/Los_Angeles',
    '-07:00': 'America/Denver',
    '-06:00': 'America/Chicago',
    '-05:00': 'America/New_York',
    '-04:00': 'America/Santiago',
    '-03:00': 'America/Sao_Paulo',
    '-02:00': 'Etc/GMT+2',
    '-01:00': 'Atlantic/Azores',
    '+00:00': 'UTC',
    '+01:00': 'Europe/Paris',
    '+02:00': 'Europe/Helsinki',
    '+03:00': 'Europe/Moscow',
    '+04:00': 'Asia/Dubai',
    '+05:00': 'Asia/Karachi',
    '+05:30': 'Asia/Kolkata',
    '+06:00': 'Asia/Dhaka',
    '+07:00': 'Asia/Bangkok',
    '+08:00': 'Asia/Singapore',
    '+09:00': 'Asia/Tokyo',
    '+10:00': 'Australia/Sydney',
    '+11:00': 'Pacific/Guadalcanal',
    '+12:00': 'Pacific/Auckland',
  };

  const m = isoDate.match(/([+-]\d{2}:\d{2})$/);
  if (m) {
    return offsetMap[m[1]] || fallback;
  }
  // Z means UTC
  if (isoDate.endsWith('Z')) return 'UTC';
  return fallback;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

type Platform = 'luma' | 'eventbrite' | 'partiful' | 'meetup' | 'posh';

function detectPlatform(url: string): Platform | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'lu.ma' || host === 'luma.com') return 'luma';
    if (host.startsWith('eventbrite.')) return 'eventbrite';
    if (host === 'partiful.com') return 'partiful';
    if (host === 'meetup.com') return 'meetup';
    if (host === 'posh.vip') return 'posh';
  } catch {
    // invalid URL
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTML fetcher with reasonable User-Agent
// ---------------------------------------------------------------------------

async function fetchHtml(url: string): Promise<string> {
  // SSRF-safe: http(s) only, public IPs only, redirects re-validated, 8s / 2MB caps
  const res = await safeFetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; SheetsEventBot/1.0; +https://sheeets.com)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    // Don't leak upstream status codes to clients
    throw new SafeFetchError('Could not fetch that page. Try entering details manually.');
  }

  return res.text;
}

// ---------------------------------------------------------------------------
// JSON-LD Event parser (shared by Eventbrite, Meetup, Partiful)
// ---------------------------------------------------------------------------

interface JsonLdEvent {
  name?: string;
  startDate?: string;
  endDate?: string;
  address?: string;
  organizer?: string;
  cost?: string;
  image?: string;
  timezone?: string;
}

function parseJsonLdEvent(html: string): JsonLdEvent | null {
  // Find all <script type="application/ld+json"> blocks
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);

      // Could be an array or a single object
      const items = Array.isArray(json) ? json : [json];

      for (const item of items) {
        // Handle @graph arrays (some sites nest events inside)
        const candidates = item['@graph'] ? [...item['@graph'], item] : [item];

        for (const candidate of candidates) {
          const type = candidate['@type'];
          const isEvent =
            type === 'Event' ||
            type === 'SocialEvent' ||
            (Array.isArray(type) && (type.includes('Event') || type.includes('SocialEvent')));

          if (!isEvent) continue;

          // Extract address
          let address = '';
          const loc = candidate.location;
          if (loc) {
            // location can be an object or array of objects
            const locObj = Array.isArray(loc) ? loc[0] : loc;
            if (typeof locObj === 'string') {
              address = locObj;
            } else if (locObj) {
              const addr = locObj.address;
              if (typeof addr === 'string') {
                address = addr;
              } else if (addr && typeof addr === 'object') {
                const parts = [
                  addr.streetAddress,
                  addr.addressLocality,
                  addr.addressRegion,
                  addr.postalCode,
                  addr.addressCountry,
                ].filter(Boolean);
                address = parts.join(', ');
              }
              // Prepend venue name if available
              if (locObj.name && !address.includes(locObj.name)) {
                address = address ? `${locObj.name}, ${address}` : locObj.name;
              }
            }
          }

          // Extract organizer
          let organizer = '';
          const org = candidate.organizer;
          if (org) {
            const orgObj = Array.isArray(org) ? org[0] : org;
            if (typeof orgObj === 'string') {
              organizer = orgObj;
            } else if (orgObj?.name) {
              organizer = orgObj.name;
            }
          }

          // Extract cost from offers
          let cost = '';
          const offers = candidate.offers;
          if (offers) {
            const offerObj = Array.isArray(offers) ? offers[0] : offers;
            if (offerObj) {
              const price = offerObj.price ?? offerObj.lowPrice;
              if (price === 0 || price === '0' || price === '0.00') {
                cost = 'Free';
              } else if (price != null && price !== '') {
                const currency = offerObj.priceCurrency || 'USD';
                cost = currency === 'USD' ? `$${price}` : `${price} ${currency}`;
              }
            }
          }

          // Extract timezone if available (Partiful and others may embed it)
          const locObj2 = Array.isArray(loc) ? loc?.[0] : loc;
          const timezone =
            candidate.timezone ||
            candidate.eventSchedule?.scheduleTimezone ||
            locObj2?.timezone ||
            '';

          return {
            name: candidate.name || '',
            startDate: candidate.startDate || '',
            endDate: candidate.endDate || '',
            address,
            organizer,
            cost,
            image: candidate.image || '',
            timezone,
          };
        }
      }
    } catch {
      // Ignore invalid JSON blocks
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// OG meta tag fallback parser
// ---------------------------------------------------------------------------

interface OgMeta {
  title?: string;
  description?: string;
  image?: string;
}

function parseOgMeta(html: string): OgMeta {
  const result: OgMeta = {};

  const titleMatch = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i
  );
  if (titleMatch) result.title = decodeHtmlEntities(titleMatch[1]);

  const descMatch = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i
  );
  if (descMatch) result.description = decodeHtmlEntities(descMatch[1]);

  const imgMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  );
  if (imgMatch) result.image = imgMatch[1];

  return result;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

// ---------------------------------------------------------------------------
// Luma parser (uses their API)
// ---------------------------------------------------------------------------

function getLumaSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (
      u.hostname === 'lu.ma' ||
      u.hostname === 'luma.com' ||
      u.hostname === 'www.luma.com'
    ) {
      const slug = u.pathname.replace(/^\//, '').split('/')[0];
      return slug || null;
    }
  } catch {
    // invalid URL
  }
  return null;
}

interface EventResult {
  name: string;
  dateISO: string;
  startTime24: string;
  endTime24: string;
  address: string;
  organizer: string;
  cost: string;
  link: string;
  tags: string;
}

async function parseLuma(url: string): Promise<EventResult> {
  const slug = getLumaSlug(url);
  if (!slug) throw new UserFacingError('Invalid Luma URL.');

  const res = await fetch(`https://api.lu.ma/url?url=${encodeURIComponent(slug)}`, {
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new UserFacingError('Could not fetch event from Luma. Please check the URL.');
  }

  const data = await res.json();

  if (data.kind !== 'event' || !data.data?.event) {
    throw new UserFacingError('URL does not point to a Luma event.');
  }

  const event = data.data.event;
  const timezone = event.timezone || 'America/Denver';

  // Parse address
  let address = '';
  if (event.geo_address_json) {
    try {
      const geo =
        typeof event.geo_address_json === 'string'
          ? JSON.parse(event.geo_address_json)
          : event.geo_address_json;
      address = geo.full_address || geo.address || '';
    } catch {
      // ignore
    }
  }
  if (!address && event.geo_address_info) {
    const info =
      typeof event.geo_address_info === 'string'
        ? JSON.parse(event.geo_address_info)
        : event.geo_address_info;
    address = info.full_address || info.city_state || info.city || '';
  }

  const organizer = data.data.hosts?.[0]?.name || '';
  const cost = formatCost(event.ticket_price_cents);

  return {
    name: event.name || '',
    dateISO: formatDateISO(event.start_at, timezone),
    startTime24: formatTime24(event.start_at, timezone),
    endTime24: event.end_at ? formatTime24(event.end_at, timezone) : '',
    address,
    organizer,
    cost,
    link: url.trim(),
    tags: '',
  };
}

// ---------------------------------------------------------------------------
// Eventbrite parser (JSON-LD + OG fallback)
// ---------------------------------------------------------------------------

async function parseEventbrite(url: string): Promise<EventResult> {
  const html = await fetchHtml(url);

  const jsonLd = parseJsonLdEvent(html);
  const og = parseOgMeta(html);

  const name = jsonLd?.name || og.title || '';
  if (!name) throw new UserFacingError('Could not parse event details from Eventbrite.');

  const DEFAULT_TZ = 'America/Chicago';
  const startDate = jsonLd?.startDate || '';
  const endDate = jsonLd?.endDate || '';
  const eventTz = jsonLd?.timezone || '';
  const guessedTz = startDate ? guessTimezoneFromOffset(startDate, DEFAULT_TZ) : DEFAULT_TZ;
  const timezone = eventTz || (guessedTz === 'UTC' ? DEFAULT_TZ : guessedTz);

  return {
    name,
    dateISO: startDate ? formatDateISO(startDate, timezone) : '',
    startTime24: startDate ? formatTime24(startDate, timezone) : '',
    endTime24: endDate ? formatTime24(endDate, timezone) : '',
    address: jsonLd?.address || '',
    organizer: jsonLd?.organizer || '',
    cost: jsonLd?.cost || 'Free',
    link: url.trim(),
    tags: '',
  };
}

// ---------------------------------------------------------------------------
// Partiful parser (OG + JSON-LD)
// ---------------------------------------------------------------------------

async function parsePartiful(url: string): Promise<EventResult> {
  const html = await fetchHtml(url);

  const jsonLd = parseJsonLdEvent(html);
  const og = parseOgMeta(html);

  // Try __NEXT_DATA__ for timezone (Partiful is a Next.js app)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextEvent: any = null;
  const nextDataMatch = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageProps = (nextData as any)?.props?.pageProps;
      nextEvent =
        pageProps?.event ||
        pageProps?.eventData ||
        pageProps?.initialEvent ||
        null;
    } catch {
      // ignore
    }
  }

  const name = jsonLd?.name || og.title || '';
  if (!name) throw new UserFacingError('Could not parse event details from Partiful.');

  const DEFAULT_TZ = 'America/Chicago';
  const startDate = jsonLd?.startDate || '';
  const endDate = jsonLd?.endDate || '';

  // Prefer event timezone from JSON-LD or __NEXT_DATA__ over guessing from offset
  // This is critical when dates are UTC (Z suffix) but the event is in a local timezone
  const eventTz = jsonLd?.timezone || nextEvent?.timezone || '';
  const guessedTz = startDate ? guessTimezoneFromOffset(startDate, DEFAULT_TZ) : DEFAULT_TZ;
  const timezone = eventTz || (guessedTz === 'UTC' ? DEFAULT_TZ : guessedTz);

  return {
    name,
    dateISO: startDate ? formatDateISO(startDate, timezone) : '',
    startTime24: startDate ? formatTime24(startDate, timezone) : '',
    endTime24: endDate ? formatTime24(endDate, timezone) : '',
    address: jsonLd?.address || '',
    organizer: jsonLd?.organizer || '',
    cost: jsonLd?.cost || 'Free',
    link: url.trim(),
    tags: '',
  };
}

// ---------------------------------------------------------------------------
// Meetup parser (JSON-LD + OG fallback)
// ---------------------------------------------------------------------------

async function parseMeetup(url: string): Promise<EventResult> {
  const html = await fetchHtml(url);

  const jsonLd = parseJsonLdEvent(html);
  const og = parseOgMeta(html);

  const name = jsonLd?.name || og.title || '';
  if (!name) throw new UserFacingError('Could not parse event details from Meetup.');

  const DEFAULT_TZ = 'America/Chicago';
  const startDate = jsonLd?.startDate || '';
  const endDate = jsonLd?.endDate || '';
  const eventTz = jsonLd?.timezone || '';
  const guessedTz = startDate ? guessTimezoneFromOffset(startDate, DEFAULT_TZ) : DEFAULT_TZ;
  const timezone = eventTz || (guessedTz === 'UTC' ? DEFAULT_TZ : guessedTz);

  return {
    name,
    dateISO: startDate ? formatDateISO(startDate, timezone) : '',
    startTime24: startDate ? formatTime24(startDate, timezone) : '',
    endTime24: endDate ? formatTime24(endDate, timezone) : '',
    address: jsonLd?.address || '',
    organizer: jsonLd?.organizer || '',
    cost: jsonLd?.cost || 'Free',
    link: url.trim(),
    tags: '',
  };
}

// ---------------------------------------------------------------------------
// Posh parser (JSON-LD + OG + __NEXT_DATA__ fallback)
// ---------------------------------------------------------------------------

async function parsePosh(url: string): Promise<EventResult> {
  const html = await fetchHtml(url);

  const jsonLd = parseJsonLdEvent(html);
  const og = parseOgMeta(html);

  // Try __NEXT_DATA__ as an additional data source (posh.vip is a Next.js app)
  let nextData: Record<string, unknown> | null = null;
  const nextDataMatch = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (nextDataMatch) {
    try {
      nextData = JSON.parse(nextDataMatch[1]);
    } catch {
      // ignore invalid JSON
    }
  }

  // Extract event data from __NEXT_DATA__ props if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextEvent: any = null;
  if (nextData) {
    try {
      // Navigate through Next.js page props to find event data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageProps = (nextData as any)?.props?.pageProps;
      // Posh may nest event data under various keys
      nextEvent =
        pageProps?.event ||
        pageProps?.eventData ||
        pageProps?.initialEvent ||
        null;
    } catch {
      // ignore
    }
  }

  // Resolve name: JSON-LD > OG > __NEXT_DATA__
  const name =
    jsonLd?.name ||
    og.title ||
    nextEvent?.name ||
    nextEvent?.title ||
    '';
  if (!name) throw new UserFacingError('Could not parse event details from Posh.');

  const DEFAULT_TZ = 'America/New_York';

  // Resolve dates: JSON-LD > __NEXT_DATA__
  const startDate =
    jsonLd?.startDate ||
    nextEvent?.startUtc ||
    nextEvent?.start ||
    nextEvent?.startDate ||
    '';
  const endDate =
    jsonLd?.endDate ||
    nextEvent?.endUtc ||
    nextEvent?.end ||
    nextEvent?.endDate ||
    '';

  // Resolve timezone: __NEXT_DATA__ may include a timezone field
  const eventTz = nextEvent?.timezone || '';
  const timezone = eventTz || (startDate ? guessTimezoneFromOffset(startDate, DEFAULT_TZ) : DEFAULT_TZ);

  // Resolve address: JSON-LD > __NEXT_DATA__
  let address = jsonLd?.address || '';
  if (!address && nextEvent) {
    const venue = nextEvent.venueName || nextEvent.venue?.name || '';
    const loc =
      nextEvent.venueAddress ||
      nextEvent.venue?.address ||
      nextEvent.location ||
      '';
    if (venue && loc) {
      address = `${venue}, ${loc}`;
    } else {
      address = venue || loc || '';
    }
  }

  // Resolve organizer: JSON-LD > __NEXT_DATA__
  const organizer =
    jsonLd?.organizer ||
    nextEvent?.organizer?.name ||
    nextEvent?.organizerName ||
    nextEvent?.group?.name ||
    '';

  // Resolve cost: JSON-LD > __NEXT_DATA__
  let cost = jsonLd?.cost || '';
  if (!cost && nextEvent) {
    const price = nextEvent.price ?? nextEvent.ticketPrice;
    if (price === 0 || price === '0' || price === 'free' || price === 'Free') {
      cost = 'Free';
    } else if (price != null && price !== '') {
      cost = typeof price === 'number' ? `$${price}` : String(price);
    }
  }
  if (!cost) cost = 'Free';

  return {
    name,
    dateISO: startDate ? formatDateISO(startDate, timezone) : '',
    startTime24: startDate ? formatTime24(startDate, timezone) : '',
    endTime24: endDate ? formatTime24(endDate, timezone) : '',
    address,
    organizer,
    cost,
    link: url.trim(),
    tags: '',
  };
}

// ---------------------------------------------------------------------------
// Generic parser (JSON-LD + OG fallback for any URL)
// ---------------------------------------------------------------------------

async function parseGeneric(url: string): Promise<EventResult> {
  const html = await fetchHtml(url);

  const jsonLd = parseJsonLdEvent(html);
  const og = parseOgMeta(html);

  const name = jsonLd?.name || og.title || '';
  if (!name) {
    throw new UserFacingError(
      'Could not find event details on this page. Try entering details manually.'
    );
  }

  const DEFAULT_TZ = 'UTC';
  const startDate = jsonLd?.startDate || '';
  const endDate = jsonLd?.endDate || '';
  const timezone = startDate ? guessTimezoneFromOffset(startDate, DEFAULT_TZ) : DEFAULT_TZ;

  // Resolve relative og:image URLs to absolute
  let image = jsonLd?.image || og.image || '';
  if (image && !image.startsWith('http')) {
    try {
      image = new URL(image, url).href;
    } catch {
      // leave as-is
    }
  }

  return {
    name,
    dateISO: startDate ? formatDateISO(startDate, timezone) : '',
    startTime24: startDate ? formatTime24(startDate, timezone) : '',
    endTime24: endDate ? formatTime24(endDate, timezone) : '',
    address: jsonLd?.address || '',
    organizer: jsonLd?.organizer || '',
    cost: jsonLd?.cost || '',
    link: url.trim(),
    tags: '',
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { data, error } = await parseBody(request, FetchEventSchema);
    if (error) return error;

    const trimmedUrl = data.url.trim();

    // Validate it looks like a URL
    try {
      new URL(trimmedUrl);
    } catch {
      return NextResponse.json({ error: 'Please enter a valid URL.' }, { status: 400 });
    }

    const platform = detectPlatform(trimmedUrl);
    let result: EventResult;

    switch (platform) {
      case 'luma':
        result = await parseLuma(trimmedUrl);
        break;
      case 'eventbrite':
        result = await parseEventbrite(trimmedUrl);
        break;
      case 'partiful':
        result = await parsePartiful(trimmedUrl);
        break;
      case 'meetup':
        result = await parseMeetup(trimmedUrl);
        break;
      case 'posh':
        result = await parsePosh(trimmedUrl);
        break;
      default:
        result = await parseGeneric(trimmedUrl);
        break;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('fetch-event API error:', err);
    // Only surface messages we wrote ourselves; never raw upstream/network errors
    const message =
      err instanceof SafeFetchError || err instanceof UserFacingError
        ? err.message
        : 'Failed to fetch event details.';
    return NextResponse.json(
      { error: message },
      { status: 422 }
    );
  }
}
