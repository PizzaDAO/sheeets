import { ETHDenverEvent } from './types';

const SITE_URL = 'https://plan.wtf';

/**
 * Serialize JSON-LD for embedding in a <script> tag via dangerouslySetInnerHTML.
 * Escapes <, >, & (and U+2028/U+2029) so user-controlled strings such as event
 * names cannot close the script tag (e.g. "</script><script>...") and inject HTML.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Convert a time string like "12:00p", "6:00 PM", "9:00a" to ISO 8601 format.
 * Returns "HH:MM:00" or null if unparseable.
 */
export function buildISO8601(timeStr: string): string | null {
  if (!timeStr) return null;
  const normalized = timeStr.toLowerCase().trim();
  if (normalized === 'all day' || normalized === 'tbd') return null;

  const match = normalized.match(/(\d{1,2}):?(\d{2})?\s*(am?|pm?)?/i);
  if (!match) return null;

  let hour = parseInt(match[1]);
  const minutes = match[2] ? match[2] : '00';
  const isPM = match[3] && match[3].startsWith('p');
  const isAM = match[3] && match[3].startsWith('a');

  if (isPM && hour !== 12) hour += 12;
  if (isAM && hour === 12) hour = 0;

  return `${hour.toString().padStart(2, '0')}:${minutes}:00`;
}

/** Build JSON-LD for the WebSite (used in root layout) */
export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'plan.wtf',
    url: SITE_URL,
    description:
      'Browse and discover conference side events. Filter by date, time, tags, and more.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Build JSON-LD for a single event */
export function buildEventJsonLd(event: ETHDenverEvent, conferenceSlug: string) {
  const startISO = event.dateISO
    ? event.isAllDay
      ? event.dateISO
      : (() => {
          const time = buildISO8601(event.startTime);
          return time ? `${event.dateISO}T${time}` : event.dateISO;
        })()
    : undefined;

  const endISO = event.dateISO && event.endTime
    ? (() => {
        const time = buildISO8601(event.endTime);
        return time ? `${event.dateISO}T${time}` : undefined;
      })()
    : undefined;

  const ld: Record<string, unknown> = {
    '@type': 'Event',
    name: event.name,
    startDate: startISO,
    ...(endISO && { endDate: endISO }),
    ...(event.isAllDay && {
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    }),
    ...(event.address && {
      location: {
        '@type': 'Place',
        name: event.address,
        ...(event.lat != null &&
          event.lng != null && {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: event.lat,
              longitude: event.lng,
            },
          }),
      },
    }),
    ...(event.organizer && {
      organizer: {
        '@type': 'Organization',
        name: event.organizer,
      },
    }),
    ...(event.isFree && {
      isAccessibleForFree: true,
    }),
    ...(event.link && { url: event.link }),
    ...(event.cost &&
      !event.isFree && {
        offers: {
          '@type': 'Offer',
          price: event.cost,
          priceCurrency: 'USD',
          url: event.link || `${SITE_URL}/${conferenceSlug}`,
        },
      }),
  };

  return ld;
}

/** Build CollectionPage JSON-LD for a conference page (limit to 50 events) */
export function buildCollectionPageJsonLd(
  conferenceName: string,
  conferenceSlug: string,
  events: ETHDenverEvent[],
) {
  const limited = events.slice(0, 50);

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${conferenceName} Side Events`,
    url: `${SITE_URL}/${conferenceSlug}`,
    description: `Browse ${events.length}+ side events for ${conferenceName}. Filter by date, time, tags, and more.`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: events.length,
      itemListElement: limited.map((event, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: buildEventJsonLd(event, conferenceSlug),
      })),
    },
  };
}

/** Build BreadcrumbList JSON-LD for conference pages */
export function buildBreadcrumbJsonLd(conferenceName: string, conferenceSlug: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: conferenceName,
        item: `${SITE_URL}/${conferenceSlug}`,
      },
    ],
  };
}
