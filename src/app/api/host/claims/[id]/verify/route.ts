import { NextRequest, NextResponse } from 'next/server';
import { ClaimIdSchema } from '@/lib/api-validation';
import { getUserFromRequest, getServiceSupabase } from '@/lib/server-auth';
import {
  findVerificationCode,
  getLumaEventApiId,
  getValidLumaSlug,
  snapshotHosts,
  type LumaEventPayload,
} from '@/lib/luma';
import { fetchLumaEvent, LumaFetchError } from '@/lib/luma-server';
import { CLAIM_LIMITS, isUniqueViolation, toPublicClaim, type ClaimRow } from '@/lib/host-claims';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * POST /api/host/claims/[id]/verify — check Luma for the claim's code.
 *
 * - Code in the event description → verified for THIS event only.
 * - Code in a listed host's bio → verified, and the user is recorded as
 *   controlling that Luma host account (verified_luma_hosts), so their future
 *   claims on events listing that host auto-verify.
 *
 * Guarded by a per-claim cooldown and attempt cap (plus Vercel per-IP limits).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = ClaimIdSchema.safeParse((await params).id);
  if (!parsedId.success) return NextResponse.json({ error: 'Invalid claim id' }, { status: 400 });
  const id = parsedId.data;

  const auth = await getUserFromRequest(req);
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const sb = getServiceSupabase();
  const { data: row, error: loadErr } = await sb
    .from('event_claims')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: 'Could not load claim' }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
  const claim = row as ClaimRow;

  if (claim.status === 'verified') {
    return NextResponse.json({ result: 'verified', claim: toPublicClaim(claim) }, { headers: NO_STORE });
  }
  if (claim.status !== 'pending' || !claim.verification_code) {
    return NextResponse.json({ error: 'This claim cannot be verified via Luma.' }, { status: 409 });
  }
  if (claim.verify_attempts >= CLAIM_LIMITS.maxVerifyAttempts) {
    return NextResponse.json(
      { error: 'Too many attempts. Request manual review instead.', claim: toPublicClaim(claim) },
      { status: 429 }
    );
  }
  const nowMs = Date.now();
  if (claim.last_verify_at) {
    const waitMs = new Date(claim.last_verify_at).getTime() + CLAIM_LIMITS.verifyCooldownSec * 1000 - nowMs;
    if (waitMs > 0) {
      const retryAfter = Math.ceil(waitMs / 1000);
      return NextResponse.json(
        { error: `Please wait ${retryAfter}s before checking again.`, retry_after: retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }
  }

  // Consume an attempt with optimistic concurrency, so parallel requests
  // can't bypass the cooldown / cap.
  const { data: bumped, error: bumpErr } = await sb
    .from('event_claims')
    .update({ verify_attempts: claim.verify_attempts + 1, last_verify_at: new Date(nowMs).toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .eq('verify_attempts', claim.verify_attempts)
    .select('*')
    .maybeSingle();
  if (bumpErr) return NextResponse.json({ error: 'Could not verify claim' }, { status: 500 });
  if (!bumped) {
    return NextResponse.json(
      { error: `Please wait ${CLAIM_LIMITS.verifyCooldownSec}s before checking again.`, retry_after: CLAIM_LIMITS.verifyCooldownSec },
      { status: 429 }
    );
  }
  const current = bumped as ClaimRow;

  // Fetch the Luma event: prefer the stable api id captured at claim time,
  // else the slug of the sheet link stored on the claim. Never a client URL.
  let payload: LumaEventPayload;
  try {
    if (current.luma_event_api_id) {
      payload = await fetchLumaEvent({ apiId: current.luma_event_api_id });
    } else {
      const slug = getValidLumaSlug(current.event_link);
      if (!slug) {
        return NextResponse.json({ error: 'This event is not on Luma. Request manual review.' }, { status: 409 });
      }
      payload = await fetchLumaEvent({ slug });
    }
  } catch (err) {
    const notFound = err instanceof LumaFetchError && err.code === 'not_found';
    return NextResponse.json(
      {
        error: notFound
          ? 'Luma could not find this event. Request manual review.'
          : 'Could not reach Luma. Try again in a moment.',
        claim: toPublicClaim(current),
      },
      { status: notFound ? 422 : 502 }
    );
  }

  const lumaApiId = getLumaEventApiId(payload) ?? current.luma_event_api_id;
  const match = findVerificationCode(payload, current.verification_code!);

  if (!match) {
    return NextResponse.json(
      { result: 'not_found', claim: toPublicClaim(current) },
      { headers: NO_STORE }
    );
  }

  const checkedAt = new Date().toISOString();
  const hostApiId = match.matched_in === 'host_bio' ? match.host_api_id : null;
  const { data: verified, error: verifyErr } = await sb
    .from('event_claims')
    .update({
      status: 'verified',
      verified_at: checkedAt,
      luma_event_api_id: lumaApiId,
      host_api_id: hostApiId,
      evidence: {
        ...match,
        luma_event_api_id: lumaApiId,
        hosts: snapshotHosts(payload),
        checked_at: checkedAt,
      },
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (verifyErr) return NextResponse.json({ error: 'Could not verify claim' }, { status: 500 });
  if (!verified) return NextResponse.json({ error: 'Claim is no longer pending' }, { status: 409 });

  // Only a host_bio match proves control of a Luma host account → host-wide coverage.
  let hostWide = false;
  if (match.matched_in === 'host_bio') {
    const { error: grantErr } = await sb.from('verified_luma_hosts').insert({
      user_id: userId,
      host_api_id: match.host_api_id,
      host_name: match.host_name,
      claim_id: id,
    });
    if (!grantErr || isUniqueViolation(grantErr)) hostWide = true;
    else console.error('[host-claims] failed to record verified Luma host:', grantErr.message);
  }

  return NextResponse.json(
    {
      result: 'verified',
      matched_in: match.matched_in,
      host_wide: hostWide,
      host_name: match.matched_in === 'host_bio' ? match.host_name : null,
      claim: toPublicClaim(verified as ClaimRow),
    },
    { headers: NO_STORE }
  );
}
