import { NextRequest, NextResponse } from 'next/server';
import { isAdminPassword } from '@/lib/admin-auth';
import { getServiceSupabase } from '@/lib/server-auth';
import { fetchEventsCached } from '@/lib/fetch-events-cached';
import { isMissingSchemaError } from '@/lib/error-store';
import { normalizeHandle, type LumaHostSnapshot } from '@/lib/luma';
import type { ClaimRow } from '@/lib/host-claims';

export const dynamic = 'force-dynamic';

const STATUSES = new Set(['pending', 'verified', 'rejected', 'revoked', 'withdrawn']);

/**
 * GET /api/admin/claims?password=&status=pending|verified|rejected|revoked|withdrawn|all&conference=
 * Review queue, enriched with the claimant's profile, Luma hosts snapshot,
 * an "X handle matches a Luma host" hint (spoofable — hint only), other
 * verified claims on the same event, and whether the event still exists.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (!isAdminPassword(params.get('password'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const status = params.get('status') || 'pending';
  if (status !== 'all' && !STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const conference = params.get('conference') || '';

  const sb = getServiceSupabase();
  let query = sb.from('event_claims').select('*').order('created_at', { ascending: false }).limit(300);
  if (status !== 'all') query = query.eq('status', status);
  if (conference) query = query.eq('conference', conference);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json({ claims: [], note: 'event_claims table not yet created' });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const claims = (data ?? []) as ClaimRow[];
  if (claims.length === 0) return NextResponse.json({ claims: [] });

  const userIds = [...new Set(claims.map((c) => c.user_id))];
  const eventIds = [...new Set(claims.map((c) => c.event_id))];
  const claimIds = claims.map((c) => c.id);

  const [profilesRes, verifiedRes, grantsRes, eventsRes] = await Promise.all([
    sb.from('profiles').select('user_id, email, display_name, x_handle').in('user_id', userIds),
    sb.from('event_claims').select('id, user_id, event_id').eq('status', 'verified').in('event_id', eventIds),
    sb.from('verified_luma_hosts').select('claim_id, host_api_id, host_name, revoked_at').in('claim_id', claimIds),
    fetchEventsCached().catch(() => null),
  ]);

  type Profile = { user_id: string; email: string | null; display_name: string | null; x_handle: string | null };
  const profiles = new Map<string, Profile>(
    ((profilesRes.data ?? []) as Profile[]).map((p) => [p.user_id, p])
  );
  const verified = (verifiedRes.data ?? []) as { id: string; user_id: string; event_id: string }[];
  const grants = (grantsRes.data ?? []) as { claim_id: string; host_api_id: string; host_name: string | null; revoked_at: string | null }[];
  const liveEventIds = eventsRes ? new Set(eventsRes.map((e) => e.id)) : null;

  const enriched = claims.map((c) => {
    const profile = profiles.get(c.user_id) ?? null;
    const hosts = (Array.isArray((c.evidence as { hosts?: unknown })?.hosts)
      ? (c.evidence as { hosts: LumaHostSnapshot[] }).hosts
      : []) as LumaHostSnapshot[];
    const xh = normalizeHandle(profile?.x_handle);
    const matchingHost = xh ? hosts.find((h) => normalizeHandle(h.twitter_handle) === xh) : undefined;
    const others = verified.filter((v) => v.event_id === c.event_id && v.id !== c.id);
    return {
      ...c,
      claimant: profile
        ? { email: profile.email, display_name: profile.display_name, x_handle: profile.x_handle }
        : null,
      hosts,
      handle_match: matchingHost ? { host_name: matchingHost.name, twitter_handle: matchingHost.twitter_handle } : null,
      other_verified_count: others.filter((v) => v.user_id !== c.user_id).length,
      host_grant: grants.find((g) => g.claim_id === c.id) ?? null,
      orphaned: liveEventIds ? !liveEventIds.has(c.event_id) : null,
    };
  });

  return NextResponse.json({ claims: enriched });
}
