import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseBody, AdminConfigSchema } from '@/lib/api-validation';
import { isAdminPassword } from '@/lib/admin-auth';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('admin_config')
    .select('key, value');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const config: Record<string, unknown> = {};
  for (const row of data) {
    config[row.key] = row.value;
  }

  return NextResponse.json(config);
}

export async function POST(req: NextRequest) {
  const { data, error: parseError } = await parseBody(req, AdminConfigSchema);
  if (parseError) return parseError;

  const { password, key, value } = data;

  if (!isAdminPassword(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from('admin_config')
    .upsert({ key, value, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
