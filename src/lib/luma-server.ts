// Server-only (node:crypto + safe-fetch); never import from client components.
import { randomBytes } from 'node:crypto';
import { safeFetch, SafeFetchError } from './safe-fetch';
import { LUMA_EVENT_API_ID_RE, LUMA_SLUG_RE, type LumaEventPayload } from './luma';

export class LumaFetchError extends Error {
  constructor(
    message: string,
    /** 'not_found' when Luma says the event doesn't exist. */
    public readonly code: 'not_found' | 'invalid' | 'upstream' = 'upstream'
  ) {
    super(message);
    this.name = 'LumaFetchError';
  }
}

const LUMA_TIMEOUT_MS = 8000;
const LUMA_MAX_BYTES = 1024 * 1024;

/**
 * Fetch a Luma event's public payload by slug or by api id. Always goes
 * through `safeFetch` (8s timeout, 1MB cap) and only ever requests
 * api.lu.ma with an id that passed strict validation — never a client URL.
 */
export async function fetchLumaEvent(
  ref: { slug: string } | { apiId: string }
): Promise<LumaEventPayload> {
  let url: string;
  if ('apiId' in ref) {
    if (!LUMA_EVENT_API_ID_RE.test(ref.apiId)) throw new LumaFetchError('Invalid Luma event id.', 'invalid');
    url = `https://api.lu.ma/event/get?event_api_id=${encodeURIComponent(ref.apiId)}`;
  } else {
    if (!LUMA_SLUG_RE.test(ref.slug)) throw new LumaFetchError('Invalid Luma slug.', 'invalid');
    url = `https://api.lu.ma/url?url=${encodeURIComponent(ref.slug)}`;
  }

  let res;
  try {
    res = await safeFetch(url, {
      timeoutMs: LUMA_TIMEOUT_MS,
      maxBytes: LUMA_MAX_BYTES,
      maxRedirects: 2,
      headers: { Accept: 'application/json', 'User-Agent': 'plan.wtf host verification' },
    });
  } catch (err) {
    throw new LumaFetchError(err instanceof SafeFetchError ? err.message : 'Could not reach Luma.');
  }

  if (res.status === 404) throw new LumaFetchError('Luma event not found.', 'not_found');
  if (!res.ok) throw new LumaFetchError(`Luma returned ${res.status}.`);

  let json: unknown;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new LumaFetchError('Luma returned an unexpected response.');
  }
  if (!json || typeof json !== 'object') throw new LumaFetchError('Luma returned an unexpected response.');

  // /url wraps the payload as { kind, data }; /event/get returns it directly.
  const obj = json as { kind?: string; data?: unknown };
  if ('kind' in obj) {
    if (obj.kind !== 'event' || !obj.data || typeof obj.data !== 'object') {
      throw new LumaFetchError('That Luma link is not an event.', 'not_found');
    }
    return obj.data as LumaEventPayload;
  }
  return json as LumaEventPayload;
}

/** Crockford base32 (no I, L, O, U) — 32 symbols, so 5 random bytes = 8 chars = 40 bits. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `planwtf-` + 8 crypto-random base32 chars (40 bits), e.g. `planwtf-K7Q2M9XD`. */
export function generateVerificationCode(): string {
  const bytes = randomBytes(5);
  // 40 bits fits exactly in a JS number (< 2^53), so plain arithmetic is safe.
  let n = 0;
  for (const b of bytes) n = n * 256 + b;
  let out = '';
  for (let i = 0; i < 8; i++) {
    out = CODE_ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return `planwtf-${out}`;
}
