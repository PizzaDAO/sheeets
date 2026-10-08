/**
 * Shared (isomorphic, dependency-free) helpers for the self-hosted error
 * monitoring pipeline:
 *
 *   browser  → src/lib/error-reporter.ts  → POST /api/errors ┐
 *   server   → src/instrumentation.ts (onRequestError)       ├→ recordAppError()
 *                                                            ┘  (src/lib/error-store.ts)
 *
 * Everything here is pure so it can be unit tested and used on both sides.
 */

export type ErrorSource = 'client' | 'server';

/** Field length caps (applied client-side before sending AND server-side). */
export const ERROR_FIELD_LIMITS = {
  message: 500,
  stack: 4000,
  url: 500,
  route: 300,
  userAgent: 300,
} as const;

/** Max reports a single page session will send. */
export const MAX_CLIENT_REPORTS_PER_SESSION = 10;

/** Max request body accepted by /api/errors. */
export const MAX_ERROR_BODY_BYTES = 32 * 1024;

/** Max items per /api/errors batch (client caps at 10 per session anyway). */
export const MAX_ERROR_BATCH = 20;

export function truncate(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

/** Lines of a stack trace that look like frames (V8 "at ..." or Firefox/Safari "fn@url"). */
function stackFrames(stack: string | null | undefined): string[] {
  if (!stack) return [];
  return stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^at\s/.test(l) || /@\S*:\d+/.test(l) || /^@?(https?|webpack|file):/.test(l));
}

/** First stack frame, with query strings stripped (cache busters change per deploy). */
export function firstStackFrame(stack: string | null | undefined): string {
  const frame = stackFrames(stack)[0] ?? '';
  return frame.replace(/\?[^\s:)]*/g, '');
}

/** First `n` lines of a stack (used for logs and client-side dedupe keys). */
export function stackHead(stack: string | null | undefined, n = 3): string {
  if (!stack) return '';
  return stack.split('\n').slice(0, n).map((l) => l.trim()).join(' | ');
}

/** Stable key for "is this the same error" inside one browser session. */
export function dedupeKey(message: string, stack: string | null | undefined): string {
  return `${message}\n${stackHead(stack, 3)}`;
}

/**
 * Input string for the fingerprint: message + first stack frame + source.
 * The server hashes this with SHA-1 (see fingerprintError in error-store.ts).
 */
export function fingerprintInput(
  message: string,
  stack: string | null | undefined,
  source: ErrorSource
): string {
  return `${source}\n${message.trim()}\n${firstStackFrame(stack)}`;
}

/* ------------------------------------------------------------------ */
/* Noise filtering                                                     */
/* ------------------------------------------------------------------ */

const EXTENSION_URL = /(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i;

const NOISE_MESSAGES: RegExp[] = [
  /ResizeObserver loop/i,
  // Network aborts / connectivity blips — not actionable bugs
  /AbortError/i,
  /The (operation|user) (was )?aborted/i,
  /signal is aborted/i,
  /^(TypeError: )?Failed to fetch$/i,
  /^(TypeError: )?Load failed$/i,
  /NetworkError when attempting to fetch resource/i,
  /^(TypeError: )?cancelled$/i,
  /^(TypeError: )?Network request failed$/i,
];

export interface NoiseCheckInput {
  message: string;
  stack?: string | null;
  /** Script URL from ErrorEvent.filename, if any. */
  filename?: string | null;
  /** Error.name, if any (e.g. 'AbortError'). */
  name?: string | null;
}

/** True for errors we never want to record (browser noise, extensions, aborts). */
export function isNoiseError({ message, stack, filename, name }: NoiseCheckInput): boolean {
  const msg = (message || '').trim();
  if (!msg && !stack) return true;
  if (name === 'AbortError') return true;
  // Cross-origin script errors carry no information at all
  if (/^Script error\.?$/i.test(msg) && !stack) return true;
  if (EXTENSION_URL.test(msg) || EXTENSION_URL.test(stack || '') || EXTENSION_URL.test(filename || '')) {
    return true;
  }
  return NOISE_MESSAGES.some((re) => re.test(msg));
}

/** Normalize an arbitrary thrown value into message/stack/name. */
export function describeError(value: unknown): { message: string; stack: string | null; name: string | null } {
  if (value instanceof Error) {
    return { message: value.message || value.name || 'Error', stack: value.stack ?? null, name: value.name ?? null };
  }
  if (typeof value === 'string') return { message: value, stack: null, name: null };
  if (value && typeof value === 'object') {
    const v = value as { message?: unknown; stack?: unknown; name?: unknown };
    if (typeof v.message === 'string') {
      return {
        message: v.message,
        stack: typeof v.stack === 'string' ? v.stack : null,
        name: typeof v.name === 'string' ? v.name : null,
      };
    }
    try {
      return { message: JSON.stringify(value).slice(0, ERROR_FIELD_LIMITS.message), stack: null, name: null };
    } catch {
      // fall through
    }
  }
  return { message: String(value), stack: null, name: null };
}
