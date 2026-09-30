import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { AdTrackSchema, parseBatchBody } from '@/lib/api-validation';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Body: a single ad event object (legacy) OR `{ events: [...] }` with up to 50
 * events (sent by src/lib/tracking-queue.ts via sendBeacon). Invalid items in
 * a batch are dropped; batches over 50 are rejected with 413.
 */
export async function POST(req: NextRequest) {
  const { items, error: parseError } = await parseBatchBody(req, AdTrackSchema);
  if (parseError) return parseError;

  if (items.length === 0) {
    return NextResponse.json({ success: true, inserted: 0 });
  }

  const rows = items.map((data) => ({
    ad_id: data.ad_id,
    ad_name: data.ad_name || null,
    placement: data.placement,
    event_type: data.event_type,
    conference: data.conference || null,
    visitor_id: data.visitor_id || null,
    url: data.url || null,
    metadata: data.metadata || {},
  }));

  const supabase = getSupabase();
  const { error } = await supabase.from('ad_events').insert(rows);

  if (error) {
    // If the table doesn't exist yet, silently accept (graceful degradation)
    if (error.code === '42P01') {
      return NextResponse.json({ success: true, note: 'table not yet created' });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, inserted: rows.length });
}
