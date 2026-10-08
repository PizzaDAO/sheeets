import { describe, it, expect } from 'vitest';
import {
  ClaimCreateSchema,
  ClaimManualSchema,
  AdminClaimActionSchema,
  ClaimIdSchema,
  EventIdSchema,
} from '../api-validation';
import { toPublicClaim, CLAIM_LIMITS, type ClaimRow } from '../host-claims';

describe('EventIdSchema', () => {
  it('accepts sheet event ids', () => {
    expect(EventIdSchema.safeParse('evt-k8f2m9').success).toBe(true);
    expect(EventIdSchema.safeParse('evt-1t4xz4b-2').success).toBe(true);
  });
  it('rejects anything else', () => {
    for (const bad of ['', 'evt-', 'k8f2m9', 'evt-K8F2', 'evt-abc/../x', 'evt-abc-', 'evt-' + 'a'.repeat(21), 'https://lu.ma/x']) {
      expect(EventIdSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('ClaimIdSchema', () => {
  it('requires a uuid', () => {
    expect(ClaimIdSchema.safeParse('6f1c2b8e-7f4c-4a51-9d2b-1c0b9e2f8a11').success).toBe(true);
    expect(ClaimIdSchema.safeParse('123').success).toBe(false);
    expect(ClaimIdSchema.safeParse("1' or 1=1").success).toBe(false);
  });
});

describe('ClaimCreateSchema', () => {
  it('accepts a bare event id and defaults manual=false', () => {
    const r = ClaimCreateSchema.safeParse({ eventId: 'evt-k8f2m9' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.manual).toBe(false);
      expect(r.data.note).toBeUndefined();
    }
  });
  it('trims the note', () => {
    const r = ClaimCreateSchema.safeParse({ eventId: 'evt-k8f2m9', manual: true, note: '  I run this  ' });
    expect(r.success && r.data.note).toBe('I run this');
  });
  it('rejects a missing / invalid event id', () => {
    expect(ClaimCreateSchema.safeParse({}).success).toBe(false);
    expect(ClaimCreateSchema.safeParse({ eventId: 42 }).success).toBe(false);
  });
  it('rejects an over-long or blank note', () => {
    expect(ClaimCreateSchema.safeParse({ eventId: 'evt-a', note: 'x'.repeat(1001) }).success).toBe(false);
    expect(ClaimCreateSchema.safeParse({ eventId: 'evt-a', note: '   ' }).success).toBe(false);
  });
  it('does not accept a client-supplied link', () => {
    const r = ClaimCreateSchema.safeParse({ eventId: 'evt-a', link: 'https://evil.example' });
    expect(r.success && 'link' in r.data).toBe(false);
  });
});

describe('ClaimManualSchema', () => {
  it('requires a non-empty note ≤ 1000 chars', () => {
    expect(ClaimManualSchema.safeParse({ note: 'Event lead, ping me @x' }).success).toBe(true);
    expect(ClaimManualSchema.safeParse({ note: '' }).success).toBe(false);
    expect(ClaimManualSchema.safeParse({}).success).toBe(false);
    expect(ClaimManualSchema.safeParse({ note: 'x'.repeat(1001) }).success).toBe(false);
  });
});

describe('AdminClaimActionSchema', () => {
  it('accepts approve / reject / revoke', () => {
    for (const action of ['approve', 'reject', 'revoke']) {
      expect(AdminClaimActionSchema.safeParse({ password: 'p', action }).success).toBe(true);
    }
  });
  it('requires eventId for relink', () => {
    expect(AdminClaimActionSchema.safeParse({ password: 'p', action: 'relink' }).success).toBe(false);
    expect(AdminClaimActionSchema.safeParse({ password: 'p', action: 'relink', eventId: 'evt-abc' }).success).toBe(true);
  });
  it('rejects unknown actions and a missing password', () => {
    expect(AdminClaimActionSchema.safeParse({ password: 'p', action: 'delete' }).success).toBe(false);
    expect(AdminClaimActionSchema.safeParse({ action: 'approve' }).success).toBe(false);
  });
});

describe('toPublicClaim', () => {
  const row: ClaimRow = {
    id: 'c1',
    user_id: 'u1',
    event_id: 'evt-a',
    event_ids: ['evt-a'],
    conference: 'KBW',
    event_name: 'Party',
    event_link: 'https://luma.com/espresso-hh',
    link_key: 'luma:espresso-hh',
    luma_event_api_id: 'evt-G9AqnOFI4wwbkKT',
    method: 'luma_code',
    status: 'pending',
    verification_code: 'planwtf-K7Q2M9XD',
    verify_attempts: 3,
    last_verify_at: null,
    claimant_note: null,
    evidence: {},
    host_api_id: null,
    derived_from_claim_id: null,
    review_note: 'internal',
    reviewed_by: null,
    reviewed_at: null,
    verified_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };

  it('exposes the code while pending and hides internal fields', () => {
    const p = toPublicClaim(row);
    expect(p.verification_code).toBe('planwtf-K7Q2M9XD');
    expect(p.is_luma).toBe(true);
    expect(p.luma_url).toBe('https://luma.com/espresso-hh');
    expect(p.attempts_left).toBe(CLAIM_LIMITS.maxVerifyAttempts - 3);
    expect(p.review_note).toBeNull();
    expect(p).not.toHaveProperty('user_id');
    expect(p).not.toHaveProperty('evidence');
  });

  it('hides the code once verified and reports matched_in', () => {
    const p = toPublicClaim({ ...row, status: 'verified', evidence: { matched_in: 'host_bio' } });
    expect(p.verification_code).toBeNull();
    expect(p.matched_in).toBe('host_bio');
  });
});
