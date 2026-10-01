import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminPassword } from '@/lib/admin-auth';
import { AdminErrorActionSchema, parseBody } from '@/lib/api-validation';
import { isMissingSchemaError } from '@/lib/error-store';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/admin/errors?password=&status=unresolved|resolved|all&source=client|server|all&limit=
 * Lists aggregated app errors, most recently seen first.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (!isAdminPassword(params.get('password'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = params.get('status') || 'unresolved';
  const source = params.get('source') || 'all';
  const limit = Math.min(Math.max(Number(params.get('limit')) || 200, 1), 500);

  let query = getSupabase()
    .from('app_errors')
    .select('id, fingerprint, source, message, stack, url, route, user_agent, release, count, first_seen, last_seen, resolved')
    .order('last_seen', { ascending: false })
    .limit(limit);

  if (status === 'unresolved') query = query.eq('resolved', false);
  else if (status === 'resolved') query = query.eq('resolved', true);
  if (source === 'client' || source === 'server') query = query.eq('source', source);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json({ errors: [], note: 'app_errors table not yet created' });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ errors: data ?? [] });
}

/** POST { password, ids: uuid[], resolved?: boolean } — mark errors (un)resolved. */
export async function POST(req: NextRequest) {
  const { data, error: parseError } = await parseBody(req, AdminErrorActionSchema);
  if (parseError) return parseError;

  if (!isAdminPassword(data.password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await getSupabase()
    .from('app_errors')
    .update({ resolved: data.resolved })
    .in('id', data.ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
