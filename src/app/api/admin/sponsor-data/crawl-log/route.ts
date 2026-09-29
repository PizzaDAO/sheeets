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
  const status = searchParams.get('status') || undefined;

  const supabase = getSupabase();

  let query = supabase
    .from('sponsor_crawl_log')
    .select('*')
    .order('crawled_at', { ascending: false });

  if (conference) query = query.eq('conference', conference);
  if (status) query = query.eq('status', status);

  const { data: entries, error } = await query;

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({
        entries: [],
        stats: { total: 0, success: 0, no_sponsors: 0, error: 0, skipped: 0 },
        note: 'sponsor_crawl_log table not yet created. Run the crawl script first.',
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stats = {
    total: entries?.length || 0,
    success: entries?.filter(e => e.status === 'success').length || 0,
    no_sponsors: entries?.filter(e => e.status === 'no_sponsors').length || 0,
    error: entries?.filter(e => e.status === 'error').length || 0,
    skipped: entries?.filter(e => e.status === 'skipped').length || 0,
  };

  return NextResponse.json({
    entries: entries || [],
    stats,
  });
}
