import { unstable_cache, revalidateTag } from 'next/cache';
import { fetchEvents } from './fetch-events';
import { getConferenceTabs } from './get-conferences';
import { ETHDenverEvent } from './types';

/** Cache tag for the server-side events data (all conferences). */
export const EVENTS_CACHE_TAG = 'events';

/**
 * Server-side cached version of fetchEvents().
 * Fetches dynamic conferences from Supabase, then fetches events from Google Sheets.
 *
 * This is the single source of truth for server-side event caching:
 * - time-based: revalidates every 5 minutes
 * - on-demand: tagged with EVENTS_CACHE_TAG, so admin writes to the sheet call
 *   `invalidateEventsCache()` and changes show up immediately (this also
 *   invalidates ISR pages that read this data).
 *
 * Note: still uses `unstable_cache` rather than `'use cache'` because Cache
 * Components (`cacheComponents: true`) changes prerendering semantics app-wide
 * (see PR description).
 */
export const fetchEventsCached: () => Promise<ETHDenverEvent[]> = unstable_cache(
  async () => {
    const tabs = await getConferenceTabs();
    return fetchEvents(undefined, tabs);
  },
  ['events-all'],
  { revalidate: 300, tags: [EVENTS_CACHE_TAG] }, // 5 minutes
);

/**
 * Expire the events cache immediately. Call from route handlers after writing
 * to the Google Sheet (admin toggle-featured, submission approval).
 */
export function invalidateEventsCache() {
  revalidateTag(EVENTS_CACHE_TAG, { expire: 0 });
}

/**
 * Look up an event's canonical link by its ID (server-side, from the cached
 * sheet data). Returns `undefined` if no event has this ID, or `''` if the
 * event exists but has no link.
 */
export async function getEventLinkById(eventId: string): Promise<string | undefined> {
  const events = await fetchEventsCached();
  const event = events.find((e) => e.id === eventId);
  return event ? event.link || '' : undefined;
}
