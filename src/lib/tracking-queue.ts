/**
 * Small batching queue for fire-and-forget tracking beacons.
 *
 * - Items are buffered and flushed every `flushIntervalMs` (default 3s) or
 *   as soon as the queue reaches `maxBatchSize` (default 25).
 * - `enqueue(item, { immediate: true })` flushes right away (used for clicks
 *   so outbound link clicks survive navigation).
 * - Flushes immediately when the page is hidden (`visibilitychange`) or
 *   unloaded (`pagehide`).
 * - Sends `{ events: [...] }` via `navigator.sendBeacon` with an
 *   `application/json` Blob when available, else `fetch` with `keepalive`.
 * - SSR-safe (no window access until the first enqueue) and never throws.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface TrackingQueueOptions {
  flushIntervalMs?: number;
  maxBatchSize?: number;
}

export interface TrackingQueue<T> {
  enqueue(item: T, opts?: { immediate?: boolean }): void;
  flush(): void;
  /** Number of items waiting to be sent (for tests). */
  size(): number;
}

/** Server-side cap on items per request — keep in sync with the API routes. */
export const MAX_TRACK_BATCH = 50;

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

function send(endpoint: string, events: unknown[]): void {
  try {
    const body = JSON.stringify({ events });

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      // sendBeacon returns false if the payload couldn't be queued — fall back to fetch
      if (navigator.sendBeacon(endpoint, blob)) return;
    }

    if (typeof fetch === 'function') {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // Silently fail -- tracking should never break the app
      });
    }
  } catch {
    // Silently fail -- tracking should never break the app
  }
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

export function createTrackingQueue<T>(
  endpoint: string,
  { flushIntervalMs = 3000, maxBatchSize = 25 }: TrackingQueueOptions = {}
): TrackingQueue<T> {
  let queue: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let listenersAttached = false;

  function flush(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (queue.length === 0) return;

    const pending = queue;
    queue = [];
    for (let i = 0; i < pending.length; i += MAX_TRACK_BATCH) {
      send(endpoint, pending.slice(i, i + MAX_TRACK_BATCH));
    }
  }

  function attachListeners(): void {
    if (listenersAttached || typeof window === 'undefined') return;
    listenersAttached = true;
    try {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
      });
      window.addEventListener('pagehide', flush);
    } catch {
      // ignore
    }
  }

  function enqueue(item: T, opts?: { immediate?: boolean }): void {
    try {
      attachListeners();
      queue.push(item);

      if (opts?.immediate || queue.length >= maxBatchSize) {
        flush();
        return;
      }
      if (!timer) {
        timer = setTimeout(flush, flushIntervalMs);
      }
    } catch {
      // Silently fail -- tracking should never break the app
    }
  }

  return { enqueue, flush, size: () => queue.length };
}
