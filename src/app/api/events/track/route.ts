import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { EventTrackSchema, parseBatchBody } from '@/lib/api-validation';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Body: a single event object (legacy) OR `{ events: [...] }` with up to 50
 * events (sent by src/lib/tracking-queue.ts via sendBeacon). Invalid items in
 * a batch are dropped; batches over 50 are rejected with 413.
 */
export async function POST(req: NextRequest) {
  const { items, error: parseError } = await parseBatchBody(req, EventTrackSchema);
  if (parseError) return parseError;

  if (items.length === 0) {
    return NextResponse.json({ success: true, inserted: 0 });
  }

  const rows = items.map((data) => ({
    event_id: data.event_id,
    event_name: data.event_name || null,
    event_type: data.event_type,
    conference: data.conference || null,
    visitor_id: data.visitor_id || null,
    url: data.url || null,
    source: data.source || null,
    metadata: data.metadata || {},
  }));

  const supabase = getSupabase();
  const { error } = await supabase.from('event_tracking').insert(rows);

  if (error) {
    // If the table doesn't exist yet, silently accept (graceful degradation)
    if (error.code === '42P01') {
      return NextResponse.json({ success: true, note: 'table not yet created' });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, inserted: rows.length });
}
