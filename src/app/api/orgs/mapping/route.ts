import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const conference = request.nextUrl.searchParams.get('conference') || '';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  let query = supabase
    .from('event_sponsors')
    .select('sponsor_name, event_id')
    .neq('sponsor_type', 'individual')
    .neq('extraction_method', 'description');

  if (conference) {
    query = query.eq('conference', conference);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ orgs: [], eventOrgs: {} }, { status: 500 });
  }

  // Aggregate: org -> event IDs, event -> org names
  const orgMap = new Map<string, Set<string>>();
  const eventOrgMap = new Map<string, Set<string>>();

  for (const row of data) {
    const name = row.sponsor_name;
    const eventId = row.event_id;

    if (!orgMap.has(name)) orgMap.set(name, new Set());
    orgMap.get(name)!.add(eventId);

    if (!eventOrgMap.has(eventId)) eventOrgMap.set(eventId, new Set());
    eventOrgMap.get(eventId)!.add(name);
  }

  const orgs = [...orgMap.entries()]
    .map(([name, ids]) => ({ name, eventIds: [...ids] }))
    .sort((a, b) => b.eventIds.length - a.eventIds.length);

  const eventOrgs: Record<string, string[]> = {};
  for (const [eventId, names] of eventOrgMap) {
    eventOrgs[eventId] = [...names];
  }

  return NextResponse.json(
    { orgs, eventOrgs },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  );
}
