import { NextRequest, NextResponse } from 'next/server';
import { parseBody, ClaimCreateSchema, EventIdSchema } from '@/lib/api-validation';
import { getUserFromRequest, getServiceSupabase } from '@/lib/server-auth';
import { fetchEventsCached } from '@/lib/fetch-events-cached';
import {
  getValidLumaSlug,
  getLumaEventApiId,
  normalizeEventLink,
  snapshotHosts,
  type LumaEventPayload,
} from '@/lib/luma';
import { fetchLumaEvent, generateVerificationCode } from '@/lib/luma-server';
import { isMissingSchemaError } from '@/lib/error-store';
import {
  CLAIM_LIMITS,
  toPublicClaim,
  isUniqueViolation,
  type ClaimRow,
} from '@/lib/host-claims';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function notReady() {
  return NextResponse.json({ error: 'Host claims are not available yet.' }, { status: 503 });
}

/**
 * GET /api/host/claims?eventId=evt-…
 * The signed-in user's open (pending/verified) claim for one event, or all of
 * their claims when eventId is omitted.
 */
export async function GET(req: NextRequest) {
  const eventIdRaw = req.nextUrl.searchParams.get('eventId');
  let eventId: string | null = null;
  if (eventIdRaw !== null) {
    const parsed = EventIdSchema.safeParse(eventIdRaw);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
    eventId = parsed.data;
  }

  const auth = await getUserFromRequest(req);
  if (auth.error) return auth.error;

  const sb = getServiceSupabase();
  let query = sb
    .from('event_claims')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (eventId) query = query.eq('event_id', eventId).in('status', ['pending', 'verified']);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return NextResponse.json({ claims: [] }, { headers: NO_STORE });
    return NextResponse.json({ error: 'Could not load claims' }, { status: 500 });
  }
  return NextResponse.json(
    { claims: (data as ClaimRow[]).map(toPublicClaim) },
    { headers: NO_STORE }
  );
}

/**
 * POST /api/host/claims { eventId, manual?, note? }
 * Create a claim. The event (and its link) is resolved server-side from the
 * sheet — the client never supplies a URL.
 * - Luma event + user already verified as one of its Luma hosts → verified
 *   immediately (method 'luma_host').
 * - Luma event → pending 'luma_code' claim with a verification code.
 * - Non-Luma event, or manual=true → pending 'manual' claim (note required).
 */
export async function POST(req: NextRequest) {
  // Validate input before auth (cheap, no I/O) so bad requests fail fast.
  const { data: body, error: parseError } = await parseBody(req, ClaimCreateSchema);
  if (parseError) return parseError;

  const auth = await getUserFromRequest(req);
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  let events;
  try {
    events = await fetchEventsCached();
  } catch {
    return NextResponse.json({ error: 'Could not load events' }, { status: 503 });
  }
  const event = events.find((e) => e.id === body.eventId);
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const sb = getServiceSupabase();

  // Idempotent: return the existing open claim for this event.
  const { data: existing, error: existingErr } = await sb
    .from('event_claims')
    .select('*')
    .eq('user_id', userId)
    .eq('event_id', event.id)
    .in('status', ['pending', 'verified'])
    .maybeSingle();
  if (existingErr) {
    if (isMissingSchemaError(existingErr)) return notReady();
    return NextResponse.json({ error: 'Could not create claim' }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ claim: toPublicClaim(existing as ClaimRow), existing: true }, { headers: NO_STORE });
  }

  const { count: pendingCount, error: countErr } = await sb
    .from('event_claims')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (countErr) return NextResponse.json({ error: 'Could not create claim' }, { status: 500 });
  if ((pendingCount ?? 0) >= CLAIM_LIMITS.maxPendingPerUser) {
    return NextResponse.json(
      { error: `You have ${CLAIM_LIMITS.maxPendingPerUser} pending claims. Verify or withdraw some first.` },
      { status: 429 }
    );
  }

  const slug = getValidLumaSlug(event.link);
  const wantsManual = body.manual || !slug;
  if (wantsManual && !body.note) {
    return NextResponse.json(
      { error: 'note: Tell us how you are involved with this event' },
      { status: 400 }
    );
  }

  // Resolve the Luma event (stable api id + hosts) — best effort; verify
  // re-fetches by slug if this fails.
  let luma: LumaEventPayload | null = null;
  if (slug) {
    try {
      luma = await fetchLumaEvent({ slug });
    } catch {
      luma = null;
    }
  }
  const lumaApiId = luma ? getLumaEventApiId(luma) : null;
  const hosts = luma ? snapshotHosts(luma) : [];
  const now = new Date().toISOString();

  const base = {
    user_id: userId,
    event_id: event.id,
    event_ids: [event.id],
    conference: event.conference,
    event_name: event.name.slice(0, 500),
    event_link: event.link || null,
    link_key: normalizeEventLink(event.link),
    luma_event_api_id: lumaApiId,
  };

  // Host-wide coverage: has this user proven control of one of the event's
  // Luma host accounts (via a host_bio match on an earlier claim)?
  let insert: Record<string, unknown> | null = null;
  if (hosts.length > 0) {
    const { data: grants } = await sb
      .from('verified_luma_hosts')
      .select('host_api_id, host_name, claim_id')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .in('host_api_id', hosts.map((h) => h.api_id));
    const grant = grants?.[0] as { host_api_id: string; host_name: string | null; claim_id: string } | undefined;
    if (grant) {
      insert = {
        ...base,
        method: 'luma_host',
        status: 'verified',
        verified_at: now,
        host_api_id: grant.host_api_id,
        derived_from_claim_id: grant.claim_id,
        claimant_note: body.note ?? null,
        evidence: {
          matched_in: 'verified_host',
          host_api_id: grant.host_api_id,
          host_name: grant.host_name,
          original_claim_id: grant.claim_id,
          luma_event_api_id: lumaApiId,
          hosts,
          checked_at: now,
        },
      };
    }
  }

  if (!insert) {
    insert = {
      ...base,
      method: wantsManual ? 'manual' : 'luma_code',
      status: 'pending',
      // Luma claims always get a code, even if they asked for manual review,
      // so they can still self-verify later.
      verification_code: slug ? generateVerificationCode() : null,
      claimant_note: body.note ?? null,
      evidence: { hosts, luma_event_api_id: lumaApiId },
    };
  }

  const { data: created, error: insertErr } = await sb
    .from('event_claims')
    .insert(insert)
    .select('*')
    .single();

  if (insertErr) {
    if (isUniqueViolation(insertErr)) {
      // Raced with a concurrent request: return the claim that won.
      const { data: winner } = await sb
        .from('event_claims')
        .select('*')
        .eq('user_id', userId)
        .eq('event_id', event.id)
        .in('status', ['pending', 'verified'])
        .maybeSingle();
      if (winner) {
        return NextResponse.json({ claim: toPublicClaim(winner as ClaimRow), existing: true }, { headers: NO_STORE });
      }
    }
    if (isMissingSchemaError(insertErr)) return notReady();
    return NextResponse.json({ error: 'Could not create claim' }, { status: 500 });
  }

  return NextResponse.json({ claim: toPublicClaim(created as ClaimRow) }, { status: 201, headers: NO_STORE });
}
