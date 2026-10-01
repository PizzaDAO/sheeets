import { NextRequest, NextResponse } from 'next/server';
import { ClaimIdSchema, ClaimManualSchema, parseBody } from '@/lib/api-validation';
import { getUserFromRequest, getServiceSupabase } from '@/lib/server-auth';
import { toPublicClaim, type ClaimRow } from '@/lib/host-claims';

export const dynamic = 'force-dynamic';

/**
 * POST /api/host/claims/[id]/manual { note } — the owner switches a pending
 * claim to manual review (admin team reviews within 48 hours). The Luma
 * verification code stays valid, so they can still self-verify meanwhile.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = ClaimIdSchema.safeParse((await params).id);
  if (!parsedId.success) return NextResponse.json({ error: 'Invalid claim id' }, { status: 400 });

  const { data: body, error: parseError } = await parseBody(req, ClaimManualSchema);
  if (parseError) return parseError;

  const auth = await getUserFromRequest(req);
  if (auth.error) return auth.error;

  const { data, error } = await getServiceSupabase()
    .from('event_claims')
    .update({ method: 'manual', claimant_note: body.note })
    .eq('id', parsedId.data)
    .eq('user_id', auth.user.id)
    .eq('status', 'pending')
    .in('method', ['luma_code', 'manual'])
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Could not request review' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Pending claim not found' }, { status: 404 });

  return NextResponse.json(
    { claim: toPublicClaim(data as ClaimRow) },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
