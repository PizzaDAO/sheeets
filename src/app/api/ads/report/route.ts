import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminPassword } from '@/lib/admin-auth';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const password = searchParams.get('password');
  if (!isAdminPassword(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const conference = searchParams.get('conference') || undefined;
  const start_date = searchParams.get('start_date') || undefined;
  const end_date = searchParams.get('end_date') || undefined;

  const now = new Date();
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startISO = start_date || defaultStart.toISOString();
  const endISO = end_date || now.toISOString();

  const supabase = getSupabase();

  // Try the RPC function first (aggregates server-side, no row limit)
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_ad_report', {
    p_start_date: startISO,
    p_end_date: endISO,
    p_conference: conference || null,
  });

  if (!rpcError && rpcData) {
    const ads = (rpcData as any[]).map(a => ({
      ad_id: a.ad_id,
      ad_name: a.ad_name || a.ad_id,
      placement: a.placement,
      impressions: Number(a.impressions),
      unique_impressions: Number(a.unique_impressions),
      clicks: Number(a.clicks),
      unique_clicks: Number(a.unique_clicks),
      ctr: Number(a.ctr),
      first_seen: a.first_seen,
      last_seen: a.last_seen,
    }));

    const totalImpressions = ads.reduce((sum, a) => sum + a.impressions, 0);
    const totalClicks = ads.reduce((sum, a) => sum + a.clicks, 0);

    return NextResponse.json({
      ads,
      totals: {
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
      },
      period: { start: startISO, end: endISO },
    });
  }

  // Fallback: client-side aggregation with pagination if RPC not available
  let allEvents: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from('ad_events')
      .select('ad_id, ad_name, placement, event_type, visitor_id, created_at')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (conference) query = query.eq('conference', conference);

    const { data: events, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({
          ads: [],
          totals: { impressions: 0, clicks: 0, ctr: 0 },
          period: { start: startISO, end: endISO },
          note: 'ad_events table not yet created',
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!events || events.length === 0) break;
    allEvents = allEvents.concat(events);
    if (events.length < pageSize) break;
    offset += pageSize;
  }

  // Aggregate per ad (same as before)
  const adMap = new Map<string, {
    ad_id: string;
    ad_name: string;
    placement: string;
    impressions: number;
    unique_impressions: Set<string>;
    clicks: number;
    unique_clicks: Set<string>;
    first_seen: string;
    last_seen: string;
  }>();

  for (const ev of allEvents) {
    const key = ev.ad_id;
    if (!adMap.has(key)) {
      adMap.set(key, {
        ad_id: ev.ad_id,
        ad_name: ev.ad_name || ev.ad_id,
        placement: ev.placement,
        impressions: 0,
        unique_impressions: new Set(),
        clicks: 0,
        unique_clicks: new Set(),
        first_seen: ev.created_at,
        last_seen: ev.created_at,
      });
    }

    const agg = adMap.get(key)!;
    if (ev.ad_name && agg.ad_name === agg.ad_id) agg.ad_name = ev.ad_name;

    if (ev.event_type === 'impression') {
      agg.impressions++;
      if (ev.visitor_id) agg.unique_impressions.add(ev.visitor_id);
    } else if (ev.event_type === 'click') {
      agg.clicks++;
      if (ev.visitor_id) agg.unique_clicks.add(ev.visitor_id);
    }

    if (ev.created_at < agg.first_seen) agg.first_seen = ev.created_at;
    if (ev.created_at > agg.last_seen) agg.last_seen = ev.created_at;
  }

  const ads = Array.from(adMap.values())
    .map((a) => ({
      ad_id: a.ad_id,
      ad_name: a.ad_name,
      placement: a.placement,
      impressions: a.impressions,
      unique_impressions: a.unique_impressions.size,
      clicks: a.clicks,
      unique_clicks: a.unique_clicks.size,
      ctr: a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0,
      first_seen: a.first_seen,
      last_seen: a.last_seen,
    }))
    .sort((a, b) => b.impressions - a.impressions);

  const totalImpressions = ads.reduce((sum, a) => sum + a.impressions, 0);
  const totalClicks = ads.reduce((sum, a) => sum + a.clicks, 0);

  return NextResponse.json({
    ads,
    totals: {
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
    },
    period: { start: startISO, end: endISO },
  });
}
