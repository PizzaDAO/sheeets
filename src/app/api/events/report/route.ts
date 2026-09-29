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

  // Call the RPC function for server-side aggregation
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_event_tracking_report', {
    p_start_date: startISO,
    p_end_date: endISO,
    p_conference: conference || null,
  });

  if (rpcError) {
    // If the function or table doesn't exist yet, return empty
    if (rpcError.code === '42P01' || rpcError.code === '42883') {
      return NextResponse.json({
        events: [],
        totals: { clicks: 0, impressions: 0, pinClicks: 0, ctr: 0 },
        period: { start: startISO, end: endISO },
        note: 'event_tracking table or RPC not yet created',
      });
    }
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const events = ((rpcData as unknown[]) || []).map((e: unknown) => {
    const row = e as Record<string, unknown>;
    return {
      event_id: row.event_id as string,
      event_name: (row.event_name as string) || (row.event_id as string),
      conference: (row.conference as string) || '',
      clicks: Number(row.clicks),
      unique_clicks: Number(row.unique_clicks),
      impressions: Number(row.impressions),
      unique_impressions: Number(row.unique_impressions),
      pin_clicks: Number(row.pin_clicks),
      list_clicks: Number(row.list_clicks || 0),
      table_clicks: Number(row.table_clicks || 0),
      map_popup_clicks: Number(row.map_popup_clicks || 0),
      ctr: Number(row.ctr),
      first_seen: row.first_seen as string,
      last_seen: row.last_seen as string,
    };
  });

  const totalClicks = events.reduce((sum, e) => sum + e.clicks, 0);
  const totalImpressions = events.reduce((sum, e) => sum + e.impressions, 0);
  const totalPinClicks = events.reduce((sum, e) => sum + e.pin_clicks, 0);
  const totalListClicks = events.reduce((sum, e) => sum + e.list_clicks, 0);
  const totalTableClicks = events.reduce((sum, e) => sum + e.table_clicks, 0);
  const totalMapPopupClicks = events.reduce((sum, e) => sum + e.map_popup_clicks, 0);

  return NextResponse.json({
    events,
    totals: {
      clicks: totalClicks,
      impressions: totalImpressions,
      pinClicks: totalPinClicks,
      listClicks: totalListClicks,
      tableClicks: totalTableClicks,
      mapPopupClicks: totalMapPopupClicks,
      ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
    },
    period: { start: startISO, end: endISO },
  });
}
