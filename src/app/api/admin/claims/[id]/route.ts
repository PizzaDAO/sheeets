import { NextRequest, NextResponse } from 'next/server';
import { isAdminPassword } from '@/lib/admin-auth';
import { AdminClaimActionSchema, ClaimIdSchema, parseBody } from '@/lib/api-validation';
import { getServiceSupabase } from '@/lib/server-auth';
import { fetchEventsCached } from '@/lib/fetch-events-cached';
import { normalizeEventLink } from '@/lib/luma';
import { isUniqueViolation, revokeHostGrantCascade, type ClaimRow } from '@/lib/host-claims';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/claims/[id] { password, action, note?, eventId? }
 * - approve : pending → verified (manual review; never grants host-wide coverage)
 * - reject  : pending → rejected (note = reason shown to the claimant)
 * - revoke  : verified → revoked. Also revokes the Luma host-wide grant this
 *             claim created (if any) and every claim auto-verified through it.
 * - relink  : point the claim at a new sheet event id (keeps old ids as aliases)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = ClaimIdSchema.safeParse((await params).id);
  if (!parsedId.success) return NextResponse.json({ error: 'Invalid claim id' }, { status: 400 });
  const id = parsedId.data;

  const { data: body, error: parseError } = await parseBody(req, AdminClaimActionSchema);
  if (parseError) return parseError;
  if (!isAdminPassword(body.password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getServiceSupabase();
  const { data: row, error: loadErr } = await sb.from('event_claims').select('*').eq('id', id).maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
  const claim = row as ClaimRow;
  const now = new Date().toISOString();
  const note = body.note || null;

  if (body.action === 'approve' || body.action === 'reject') {
    if (claim.status !== 'pending') {
      return NextResponse.json({ error: `Claim is ${claim.status}, not pending` }, { status: 409 });
    }
    const approve = body.action === 'approve';
    const { data, error } = await sb
      .from('event_claims')
      .update({
        status: approve ? 'verified' : 'rejected',
        verified_at: approve ? now : null,
        review_note: note,
        reviewed_by: 'admin',
        reviewed_at: now,
        evidence: approve
          ? { ...(claim.evidence ?? {}), matched_in: 'admin_review', approved_at: now }
          : claim.evidence,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Claim is no longer pending' }, { status: 409 });
    return NextResponse.json({ success: true, claim: data });
  }

  if (body.action === 'revoke') {
    if (claim.status !== 'verified') {
      return NextResponse.json({ error: `Claim is ${claim.status}, not verified` }, { status: 409 });
    }
    const { data, error } = await sb
      .from('event_claims')
      .update({ status: 'revoked', review_note: note, reviewed_by: 'admin', reviewed_at: now })
      .eq('id', id)
      .eq('status', 'verified')
      .select('*')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Claim is no longer verified' }, { status: 409 });

    const cascade = await revokeHostGrantCascade(
      sb,
      id,
      'revoked',
      note ? `Revoked with original claim ${id}: ${note}` : `Revoked with original claim ${id}`
    );
    if (cascade.error) {
      return NextResponse.json(
        { error: `Claim revoked, but cascading to the host-wide grant failed: ${cascade.error}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, claim: data, derived_revoked: cascade.derived });
  }

  // relink
  let events;
  try {
    events = await fetchEventsCached();
  } catch {
    return NextResponse.json({ error: 'Could not load events' }, { status: 503 });
  }
  const target = events.find((e) => e.id === body.eventId);
  if (!target) return NextResponse.json({ error: 'Target event not found' }, { status: 404 });
  if (target.conference !== claim.conference) {
    return NextResponse.json({ error: 'Target event is in a different conference' }, { status: 400 });
  }
  const eventIds = claim.event_ids.includes(target.id) ? claim.event_ids : [...claim.event_ids, target.id];
  const { data, error } = await sb
    .from('event_claims')
    .update({
      event_id: target.id,
      event_ids: eventIds,
      event_name: target.name.slice(0, 500),
      event_link: target.link || null,
      link_key: normalizeEventLink(target.link),
      review_note: note ?? claim.review_note,
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'This user already has an open claim on that event' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, claim: data });
}
