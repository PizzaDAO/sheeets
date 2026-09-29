import { NextRequest, NextResponse } from 'next/server';
import { isAdminPassword } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!isAdminPassword(body?.password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
