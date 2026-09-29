import { unstable_cache } from 'next/cache';
import { fetchEvents } from './fetch-events';
import { getConferenceTabs } from './get-conferences';
import { ETHDenverEvent } from './types';

/**
 * Server-side cached version of fetchEvents().
 * Fetches dynamic conferences from Supabase, then fetches events from Google Sheets.
 * Uses Next.js unstable_cache with 5-minute revalidation
 * to avoid hitting Google Sheets on every request.
 */
export const fetchEventsCached: () => Promise<ETHDenverEvent[]> = unstable_cache(
  async () => {
    const tabs = await getConferenceTabs();
    return fetchEvents(undefined, tabs);
  },
  ['events-all'],
  { revalidate: 300 }, // 5 minutes
);

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
