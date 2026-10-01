/**
 * Browser error reporter. Captures uncaught errors / unhandled rejections
 * (installed from src/instrumentation-client.ts) and errors caught by the
 * React error boundaries, and sends them in batches to POST /api/errors via
 * the shared tracking queue.
 *
 * - Drops known noise (see isNoiseError).
 * - Dedupes per page session by message + stack head.
 * - Sends at most MAX_CLIENT_REPORTS_PER_SESSION reports per page session.
 * - Never throws.
 */

import { createTrackingQueue, type TrackingQueue } from '@/lib/tracking-queue';
import {
  ERROR_FIELD_LIMITS,
  MAX_CLIENT_REPORTS_PER_SESSION,
  dedupeKey,
  describeError,
  isNoiseError,
  truncate,
} from '@/lib/error-monitoring';

export interface ClientErrorReport {
  message: string;
  stack: string | null;
  url: string | null;
  route: string | null;
  userAgent: string | null;
  kind: 'error' | 'unhandledrejection' | 'boundary';
  digest?: string;
}

export const ERRORS_ENDPOINT = '/api/errors';

let queue: TrackingQueue<ClientErrorReport> | null = null;
const seen = new Set<string>();
let sent = 0;

function getQueue(): TrackingQueue<ClientErrorReport> {
  if (!queue) queue = createTrackingQueue<ClientErrorReport>(ERRORS_ENDPOINT, { flushIntervalMs: 2000, maxBatchSize: 10 });
  return queue;
}

/** Reset session state (tests only). */
export function __resetErrorReporter(): void {
  queue = null;
  seen.clear();
  sent = 0;
}

export function reportClientError(
  error: unknown,
  opts: { kind?: ClientErrorReport['kind']; filename?: string | null; digest?: string } = {}
): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (sent >= MAX_CLIENT_REPORTS_PER_SESSION) return false;

    const { message, stack, name } = describeError(error);
    if (isNoiseError({ message, stack, filename: opts.filename, name })) return false;

    const key = dedupeKey(message, stack);
    if (seen.has(key)) return false;
    seen.add(key);
    sent += 1;

    getQueue().enqueue({
      message: truncate(message, ERROR_FIELD_LIMITS.message) || 'Unknown error',
      stack: truncate(stack, ERROR_FIELD_LIMITS.stack),
      url: truncate(window.location.href, ERROR_FIELD_LIMITS.url),
      route: truncate(window.location.pathname, ERROR_FIELD_LIMITS.route),
      userAgent: truncate(navigator.userAgent, ERROR_FIELD_LIMITS.userAgent),
      kind: opts.kind ?? 'error',
      ...(opts.digest ? { digest: opts.digest.slice(0, 100) } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

let installed = false;

/** Attach window `error` / `unhandledrejection` listeners once. */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  try {
    window.addEventListener('error', (event: ErrorEvent) => {
      // Resource load failures (img/script 404s) fire non-ErrorEvents; skip them
      if (!(event instanceof ErrorEvent)) return;
      reportClientError(event.error ?? event.message, { kind: 'error', filename: event.filename });
    });
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      reportClientError(event.reason, { kind: 'unhandledrejection' });
    });
  } catch {
    // ignore
  }
}
