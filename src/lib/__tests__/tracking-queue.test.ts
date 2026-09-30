import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTrackingQueue } from '../tracking-queue';
import { parseBatch, EventTrackSchema, AdTrackSchema } from '../api-validation';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

class FakeBlob {
  parts: string[];
  type: string;
  constructor(parts: string[], opts?: { type?: string }) {
    this.parts = parts;
    this.type = opts?.type ?? '';
  }
}

let beacon: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

/** Decoded `events` arrays from every sendBeacon call. */
function beaconBatches(): Array<{ url: string; type: string; events: unknown[] }> {
  return beacon.mock.calls.map(([url, blob]) => ({
    url: url as string,
    type: (blob as FakeBlob).type,
    events: JSON.parse((blob as FakeBlob).parts.join('')).events,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Blob', FakeBlob);
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', {
    value: beacon,
    configurable: true,
    writable: true,
  });
  fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

describe('createTrackingQueue', () => {
  it('batches items and flushes after the interval', () => {
    const q = createTrackingQueue<{ n: number }>('/api/x', { flushIntervalMs: 3000 });
    q.enqueue({ n: 1 });
    q.enqueue({ n: 2 });
    q.enqueue({ n: 3 });
    expect(beacon).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(beacon).toHaveBeenCalledTimes(1);
    const [batch] = beaconBatches();
    expect(batch.url).toBe('/api/x');
    expect(batch.type).toBe('application/json');
    expect(batch.events).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(q.size()).toBe(0);
  });

  it('flushes when the queue reaches maxBatchSize', () => {
    const q = createTrackingQueue<{ n: number }>('/api/x', { maxBatchSize: 5 });
    for (let n = 0; n < 5; n++) q.enqueue({ n });
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beaconBatches()[0].events).toHaveLength(5);

    // Timer from the first enqueue was cleared — nothing more is sent
    vi.advanceTimersByTime(10_000);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately (with pending items) for immediate enqueues', () => {
    const q = createTrackingQueue<{ t: string }>('/api/x');
    q.enqueue({ t: 'impression' });
    q.enqueue({ t: 'click' }, { immediate: true });
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beaconBatches()[0].events).toEqual([{ t: 'impression' }, { t: 'click' }]);
  });

  it('flushes on visibilitychange to hidden and on pagehide', () => {
    const q = createTrackingQueue<{ n: number }>('/api/x');
    q.enqueue({ n: 1 });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(beacon).toHaveBeenCalledTimes(1);

    q.enqueue({ n: 2 });
    window.dispatchEvent(new Event('pagehide'));
    expect(beacon).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('falls back to fetch keepalive when sendBeacon is unavailable', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true });
    const q = createTrackingQueue<{ n: number }>('/api/x');
    q.enqueue({ n: 1 }, { immediate: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/x');
    expect(init.keepalive).toBe(true);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).events).toEqual([{ n: 1 }]);
  });

  it('falls back to fetch when sendBeacon refuses the payload', () => {
    beacon.mockReturnValue(false);
    const q = createTrackingQueue<{ n: number }>('/api/x');
    q.enqueue({ n: 1 }, { immediate: true });
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws when transport fails', () => {
    beacon.mockImplementation(() => {
      throw new Error('boom');
    });
    const q = createTrackingQueue<{ n: number }>('/api/x');
    expect(() => q.enqueue({ n: 1 }, { immediate: true })).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Dedup semantics via trackEvent / trackAdEvent                       */
/* ------------------------------------------------------------------ */

describe('trackEvent (batched)', () => {
  beforeEach(() => vi.resetModules());

  it('dedups event_id:event_type and sends clicks immediately', async () => {
    const { trackEvent } = await import('../event-tracking');
    trackEvent({ event_id: 'a', event_type: 'impression' });
    trackEvent({ event_id: 'a', event_type: 'impression' });
    trackEvent({ event_id: 'b', event_type: 'impression' });
    expect(beacon).not.toHaveBeenCalled();

    trackEvent({ event_id: 'a', event_type: 'click' });
    trackEvent({ event_id: 'a', event_type: 'click' }); // deduped
    expect(beacon).toHaveBeenCalledTimes(1);
    const [batch] = beaconBatches();
    expect(batch.url).toBe('/api/events/track');
    expect(batch.events.map((e) => (e as { event_id: string; event_type: string }))).toMatchObject([
      { event_id: 'a', event_type: 'impression' },
      { event_id: 'b', event_type: 'impression' },
      { event_id: 'a', event_type: 'click' },
    ]);
    expect((batch.events[0] as { visitor_id: string }).visitor_id).toBeTruthy();
  });
});

describe('trackAdEvent (batched)', () => {
  beforeEach(() => vi.resetModules());

  it('dedups impressions but always tracks clicks', async () => {
    const { trackAdEvent } = await import('../ad-tracking');
    trackAdEvent({ ad_id: 'x', placement: 'native-ad', event_type: 'impression' });
    trackAdEvent({ ad_id: 'x', placement: 'native-ad', event_type: 'impression' });
    vi.advanceTimersByTime(3000);
    expect(beaconBatches()[0].events).toHaveLength(1);

    trackAdEvent({ ad_id: 'x', placement: 'native-ad', event_type: 'click' });
    trackAdEvent({ ad_id: 'x', placement: 'native-ad', event_type: 'click' });
    expect(beacon).toHaveBeenCalledTimes(3);
    expect(beaconBatches()[2].url).toBe('/api/ads/track');
  });
});

/* ------------------------------------------------------------------ */
/* Server-side batch parsing                                           */
/* ------------------------------------------------------------------ */

describe('parseBatch', () => {
  const valid = { event_id: 'e1', event_type: 'impression' };

  it('accepts a single legacy object', () => {
    const r = parseBatch(valid, EventTrackSchema);
    expect(r.items).toEqual([valid]);
  });

  it('rejects an invalid single object with 400', () => {
    const r = parseBatch({ event_id: '' }, EventTrackSchema);
    expect(r.error?.status).toBe(400);
  });

  it('accepts { events: [...] } and drops invalid items', () => {
    const r = parseBatch(
      { events: [valid, { event_id: 'e2', event_type: 'bogus' }, { ...valid, event_id: 'e3' }] },
      EventTrackSchema
    );
    expect(r.items?.map((i) => i.event_id)).toEqual(['e1', 'e3']);
    expect(r.dropped).toBe(1);
  });

  it('rejects batches over 50 with 413', () => {
    const events = Array.from({ length: 51 }, (_, i) => ({ ...valid, event_id: `e${i}` }));
    expect(parseBatch({ events }, EventTrackSchema).error?.status).toBe(413);
    expect(parseBatch({ events: events.slice(0, 50) }, EventTrackSchema).items).toHaveLength(50);
  });

  it('works with the ad schema', () => {
    const r = parseBatch(
      { events: [{ ad_id: 'a', placement: 'native-ad', event_type: 'click' }, { ad_id: 'b' }] },
      AdTrackSchema
    );
    expect(r.items).toHaveLength(1);
    expect(r.dropped).toBe(1);
  });
});
