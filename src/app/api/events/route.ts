import { NextRequest, NextResponse } from 'next/server';
import { fetchEventsCached } from '@/lib/fetch-events-cached';
import { getAllConferenceTabs } from '@/lib/get-conferences';

// Server data is cached by unstable_cache (5 min, tag-invalidated on admin
// writes). Keep the CDN layer short so on-demand invalidation isn't masked
// for long; stale-while-revalidate keeps responses fast.
const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

/**
 * GET /api/events            -> all events for all conferences
 * GET /api/events?conference=<slug or name> -> only that conference's events
 */
export async function GET(request: NextRequest) {
  try {
    const conferenceParam = request.nextUrl.searchParams.get('conference')?.trim();
    const events = await fetchEventsCached();

    if (!conferenceParam) {
      return NextResponse.json(events, { headers: { 'Cache-Control': CACHE_CONTROL } });
    }

    const tabs = await getAllConferenceTabs();
    const needle = conferenceParam.toLowerCase();
    const tab = tabs.find((t) => t.slug === needle || t.name.toLowerCase() === needle);
    const conferenceName = tab?.name ?? conferenceParam;
    const filtered = events.filter((e) => e.conference === conferenceName);

    return NextResponse.json(filtered, { headers: { 'Cache-Control': CACHE_CONTROL } });
  } catch (err) {
    console.error('Events API error:', err);
    return NextResponse.json([], { status: 500 });
  }
}
