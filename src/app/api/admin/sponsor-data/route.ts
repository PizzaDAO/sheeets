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
  const search = searchParams.get('search') || undefined;
  const confidence = searchParams.get('confidence') || undefined;
  const method = searchParams.get('method') || undefined;
  const sponsorType = searchParams.get('type') || undefined;
  const view = searchParams.get('view') || 'list';
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const supabase = getSupabase();

  // --- Summary stats (always returned) ---
  const { data: allSponsors, error: summaryError } = await supabase
    .from('event_sponsors')
    .select('id, sponsor_name, confidence, extraction_method, event_id');

  if (summaryError) {
    if (summaryError.code === '42P01') {
      return NextResponse.json({
        sponsors: [],
        total: 0,
        summary: null,
        note: 'event_sponsors table not yet created. Run the crawl script first.',
      });
    }
    return NextResponse.json({ error: summaryError.message }, { status: 500 });
  }

  // Crawl log stats for events_crawled / errors / no_sponsors
  const { data: crawlLog } = await supabase
    .from('sponsor_crawl_log')
    .select('status');

  const crawlStats = {
    total_events_crawled: crawlLog?.length || 0,
    events_with_sponsors: crawlLog?.filter(l => l.status === 'success').length || 0,
    events_with_errors: crawlLog?.filter(l => l.status === 'error').length || 0,
    events_no_sponsors: crawlLog?.filter(l => l.status === 'no_sponsors').length || 0,
  };

  const uniqueNames = new Set(allSponsors?.map(s => s.sponsor_name.toLowerCase()) || []);
  const byConfidence = { high: 0, medium: 0, low: 0 };
  const byMethod: Record<string, number> = {};

  for (const s of allSponsors || []) {
    const conf = s.confidence as string;
    if (conf === 'high' || conf === 'medium' || conf === 'low') {
      byConfidence[conf]++;
    }
    byMethod[s.extraction_method] = (byMethod[s.extraction_method] || 0) + 1;
  }

  const summary = {
    total_sponsors: allSponsors?.length || 0,
    ...crawlStats,
    unique_sponsor_names: uniqueNames.size,
    by_confidence: byConfidence,
    by_method: byMethod,
  };

  // --- Aggregate view ---
  if (view === 'aggregate') {
    let query = supabase
      .from('event_sponsors')
      .select('sponsor_name, sponsor_url, sponsor_type, conference, event_id');

    if (conference) query = query.eq('conference', conference);
    if (search) query = query.ilike('sponsor_name', `%${search}%`);

    const { data: aggData, error: aggError } = await query;

    if (aggError) {
      return NextResponse.json({ error: aggError.message }, { status: 500 });
    }

    // Group by sponsor name (case-insensitive)
    const grouped = new Map<string, {
      sponsor_name: string;
      sponsor_url: string | null;
      types: Set<string>;
      conferences: Set<string>;
      event_ids: Set<string>;
    }>();

    for (const row of aggData || []) {
      const key = row.sponsor_name.toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, {
          sponsor_name: row.sponsor_name,
          sponsor_url: row.sponsor_url,
          types: new Set(),
          conferences: new Set(),
          event_ids: new Set(),
        });
      }
      const g = grouped.get(key)!;
      if (row.sponsor_url && !g.sponsor_url) g.sponsor_url = row.sponsor_url;
      if (row.sponsor_type) g.types.add(row.sponsor_type);
      if (row.conference) g.conferences.add(row.conference);
      if (row.event_id) g.event_ids.add(row.event_id);
    }

    const directory = Array.from(grouped.values())
      .map(g => ({
        sponsor_name: g.sponsor_name,
        sponsor_url: g.sponsor_url,
        types: Array.from(g.types),
        conferences: Array.from(g.conferences),
        event_count: g.event_ids.size,
        conference_count: g.conferences.size,
      }))
      .sort((a, b) => b.event_count - a.event_count);

    return NextResponse.json({ directory, total: directory.length, summary });
  }

  // --- List view (default) ---
  let query = supabase
    .from('event_sponsors')
    .select('*', { count: 'exact' });

  if (conference) query = query.eq('conference', conference);
  if (confidence) query = query.eq('confidence', confidence);
  if (method) query = query.eq('extraction_method', method);
  if (sponsorType) query = query.eq('sponsor_type', sponsorType);
  if (search) query = query.ilike('sponsor_name', `%${search}%`);

  query = query
    .order('crawled_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: sponsors, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    sponsors: sponsors || [],
    total: count || 0,
    summary,
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { password, action } = body as { password?: string; action?: string };

  if (!isAdminPassword(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  if (action === 'update') {
    const { id, fields } = body as { id?: string; fields?: Record<string, unknown> };
    if (!id || !fields) {
      return NextResponse.json({ error: 'Missing id or fields' }, { status: 400 });
    }

    const { error } = await supabase
      .from('event_sponsors')
      .update(fields)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (action === 'delete') {
    const { ids } = body as { ids?: string[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing ids array' }, { status: 400 });
    }

    const { error } = await supabase
      .from('event_sponsors')
      .delete()
      .in('id', ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: ids.length });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
