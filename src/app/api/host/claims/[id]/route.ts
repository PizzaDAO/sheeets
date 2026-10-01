import { NextRequest, NextResponse } from 'next/server';
import { ClaimIdSchema } from '@/lib/api-validation';
import { getUserFromRequest, getServiceSupabase } from '@/lib/server-auth';
import { revokeHostGrantCascade, toPublicClaim, type ClaimRow } from '@/lib/host-claims';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/host/claims/[id] — the owner withdraws (unclaims) a pending or
 * verified claim. If this claim verified a Luma host account, that host-wide
 * grant and every claim auto-verified through it are withdrawn too.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = ClaimIdSchema.safeParse((await params).id);
  if (!parsedId.success) return NextResponse.json({ error: 'Invalid claim id' }, { status: 400 });
  const id = parsedId.data;

  const auth = await getUserFromRequest(req);
  if (auth.error) return auth.error;

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from('event_claims')
    .update({ status: 'withdrawn' })
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .in('status', ['pending', 'verified'])
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Could not withdraw claim' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

  const cascade = await revokeHostGrantCascade(sb, id, 'withdrawn', null);
  if (cascade.error) console.error('[host-claims] withdraw cascade failed:', cascade.error);

  return NextResponse.json(
    { claim: toPublicClaim(data as ClaimRow), derived_withdrawn: cascade.derived },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
