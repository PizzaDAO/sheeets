// Server-side helpers shared by the host-claim API routes.
import type { SupabaseClient } from '@supabase/supabase-js';
import { isLumaUrl } from './luma';

/** Limits (also enforced per-IP by Vercel firewall rules). */
export const CLAIM_LIMITS = {
  /** Max open (pending) claims per user. */
  maxPendingPerUser: 20,
  /** Max verify attempts per claim. */
  maxVerifyAttempts: 30,
  /** Min seconds between verify attempts on one claim. */
  verifyCooldownSec: 10,
} as const;

export type ClaimStatus = 'pending' | 'verified' | 'rejected' | 'revoked' | 'withdrawn';
export type ClaimMethod = 'luma_code' | 'luma_host' | 'manual' | 'admin_grant';

export interface ClaimRow {
  id: string;
  user_id: string;
  event_id: string;
  event_ids: string[];
  conference: string;
  event_name: string;
  event_link: string | null;
  link_key: string | null;
  luma_event_api_id: string | null;
  method: ClaimMethod;
  status: ClaimStatus;
  verification_code: string | null;
  verify_attempts: number;
  last_verify_at: string | null;
  claimant_note: string | null;
  evidence: Record<string, unknown>;
  host_api_id: string | null;
  derived_from_claim_id: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What the claimant's browser sees (no internal ids, no other users' data). */
export interface PublicClaim {
  id: string;
  event_id: string;
  event_name: string;
  conference: string;
  status: ClaimStatus;
  method: ClaimMethod;
  /** Only while pending. */
  verification_code: string | null;
  is_luma: boolean;
  luma_url: string | null;
  verify_attempts: number;
  attempts_left: number;
  last_verify_at: string | null;
  claimant_note: string | null;
  matched_in: string | null;
  review_note: string | null;
  created_at: string;
  verified_at: string | null;
}

export function toPublicClaim(c: ClaimRow): PublicClaim {
  const isLuma = !!c.event_link && isLumaUrl(c.event_link);
  const matched = (c.evidence as { matched_in?: unknown } | null)?.matched_in;
  return {
    id: c.id,
    event_id: c.event_id,
    event_name: c.event_name,
    conference: c.conference,
    status: c.status,
    method: c.method,
    verification_code: c.status === 'pending' ? c.verification_code : null,
    is_luma: isLuma,
    luma_url: isLuma ? c.event_link : null,
    verify_attempts: c.verify_attempts,
    attempts_left: Math.max(0, CLAIM_LIMITS.maxVerifyAttempts - c.verify_attempts),
    last_verify_at: c.last_verify_at,
    claimant_note: c.claimant_note,
    matched_in: typeof matched === 'string' ? matched : null,
    review_note: c.status === 'rejected' || c.status === 'revoked' ? c.review_note : null,
    created_at: c.created_at,
    verified_at: c.verified_at,
  };
}

/**
 * Revoke the host-wide grant created by `claimId` (if any) and every claim
 * auto-verified through it (`derived_from_claim_id = claimId`).
 * Returns the number of derived claims changed.
 */
export async function revokeHostGrantCascade(
  sb: SupabaseClient,
  claimId: string,
  derivedStatus: 'revoked' | 'withdrawn',
  note: string | null
): Promise<{ derived: number; error?: string }> {
  const now = new Date().toISOString();
  const { error: hostErr } = await sb
    .from('verified_luma_hosts')
    .update({ revoked_at: now })
    .eq('claim_id', claimId)
    .is('revoked_at', null);
  if (hostErr) return { derived: 0, error: hostErr.message };

  const { data, error } = await sb
    .from('event_claims')
    .update({
      status: derivedStatus,
      review_note: note,
      reviewed_by: derivedStatus === 'revoked' ? 'admin' : null,
      reviewed_at: derivedStatus === 'revoked' ? now : null,
    })
    .eq('derived_from_claim_id', claimId)
    .in('status', ['pending', 'verified'])
    .select('id');
  if (error) return { derived: 0, error: error.message };
  return { derived: data?.length ?? 0 };
}

/** Postgres unique_violation. */
export function isUniqueViolation(err: { code?: string } | null | undefined): boolean {
  return err?.code === '23505';
}
