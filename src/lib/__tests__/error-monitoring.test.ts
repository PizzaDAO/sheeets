import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  firstStackFrame,
  fingerprintInput,
  isNoiseError,
  dedupeKey,
  describeError,
  truncate,
  MAX_CLIENT_REPORTS_PER_SESSION,
} from '../error-monitoring';
import { fingerprintError, isMissingSchemaError } from '../error-store';
import { parseBatch, ClientErrorSchema } from '../api-validation';
import { reportClientError, __resetErrorReporter } from '../error-reporter';

const V8_STACK = `TypeError: Cannot read properties of undefined (reading 'x')
    at foo (https://plan.wtf/_next/static/chunks/app.js?v=123:1:2345)
    at bar (https://plan.wtf/_next/static/chunks/app.js:1:999)`;

const FF_STACK = `foo@https://plan.wtf/_next/static/chunks/app.js:1:2345
bar@https://plan.wtf/_next/static/chunks/app.js:1:999`;

describe('firstStackFrame', () => {
  it('extracts the first V8 frame and strips query strings', () => {
    expect(firstStackFrame(V8_STACK)).toBe('at foo (https://plan.wtf/_next/static/chunks/app.js:1:2345)');
  });
  it('handles Firefox/Safari frames', () => {
    expect(firstStackFrame(FF_STACK)).toBe('foo@https://plan.wtf/_next/static/chunks/app.js:1:2345');
  });
  it('returns empty string with no stack', () => {
    expect(firstStackFrame(null)).toBe('');
    expect(firstStackFrame('just a message')).toBe('');
  });
});

describe('fingerprinting', () => {
  it('is a stable sha1 hex string', () => {
    const a = fingerprintError('boom', V8_STACK, 'client');
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(fingerprintError('boom', V8_STACK, 'client')).toBe(a);
  });
  it('ignores frames beyond the first and cache-buster query strings', () => {
    const otherTail = V8_STACK.replace('at bar', 'at baz').replace('?v=123', '?v=456');
    expect(fingerprintError('boom', otherTail, 'client')).toBe(fingerprintError('boom', V8_STACK, 'client'));
  });
  it('differs by message, first frame, and source', () => {
    const base = fingerprintError('boom', V8_STACK, 'client');
    expect(fingerprintError('bang', V8_STACK, 'client')).not.toBe(base);
    expect(fingerprintError('boom', V8_STACK.replace('at foo', 'at qux'), 'client')).not.toBe(base);
    expect(fingerprintError('boom', V8_STACK, 'server')).not.toBe(base);
  });
  it('fingerprintInput combines source, message and first frame', () => {
    expect(fingerprintInput(' boom ', V8_STACK, 'server')).toBe(
      'server\nboom\nat foo (https://plan.wtf/_next/static/chunks/app.js:1:2345)'
    );
  });
});

describe('isNoiseError', () => {
  it.each([
    ['ResizeObserver loop limit exceeded', undefined],
    ['ResizeObserver loop completed with undelivered notifications.', undefined],
    ['Script error.', undefined],
    ['Failed to fetch', undefined],
    ['TypeError: Load failed', undefined],
    ['NetworkError when attempting to fetch resource.', undefined],
    ['The user aborted a request.', undefined],
    ['signal is aborted without reason', undefined],
  ])('drops %s', (message, stack) => {
    expect(isNoiseError({ message, stack })).toBe(true);
  });

  it('drops AbortError by name', () => {
    expect(isNoiseError({ message: 'whatever', name: 'AbortError' })).toBe(true);
  });

  it('drops errors from browser extensions (stack or filename)', () => {
    expect(isNoiseError({ message: 'x is not defined', stack: 'at chrome-extension://abc/content.js:1:1' })).toBe(true);
    expect(isNoiseError({ message: 'x is not defined', filename: 'moz-extension://abc/x.js' })).toBe(true);
  });

  it('keeps "Script error." when it has a stack', () => {
    expect(isNoiseError({ message: 'Script error.', stack: V8_STACK })).toBe(false);
  });

  it('keeps real errors', () => {
    expect(isNoiseError({ message: "Cannot read properties of undefined (reading 'x')", stack: V8_STACK })).toBe(false);
  });

  it('drops empty errors', () => {
    expect(isNoiseError({ message: '' })).toBe(true);
  });
});

describe('helpers', () => {
  it('dedupeKey uses message + stack head', () => {
    expect(dedupeKey('a', V8_STACK)).toBe(dedupeKey('a', V8_STACK + '\n    at more (x.js:1:1)'));
    expect(dedupeKey('a', V8_STACK)).not.toBe(dedupeKey('b', V8_STACK));
  });
  it('describeError normalizes values', () => {
    expect(describeError(new TypeError('t')).message).toBe('t');
    expect(describeError('s')).toEqual({ message: 's', stack: null, name: null });
    expect(describeError({ message: 'm', name: 'AbortError' }).name).toBe('AbortError');
    expect(describeError({ a: 1 }).message).toBe('{"a":1}');
  });
  it('truncate caps length', () => {
    expect(truncate('abcdef', 3)).toBe('abc');
    expect(truncate(null, 3)).toBeNull();
  });
  it('isMissingSchemaError recognizes undeployed table/function', () => {
    expect(isMissingSchemaError({ code: '42P01' })).toBe(true);
    expect(isMissingSchemaError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingSchemaError({ code: '23505' })).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
  });
});

describe('ClientErrorSchema', () => {
  it('truncates long fields instead of rejecting', () => {
    const r = parseBatch(
      { events: [{ message: 'm'.repeat(900), stack: 's'.repeat(9000), url: 'u'.repeat(900), userAgent: 'a'.repeat(900) }] },
      ClientErrorSchema,
      20
    );
    expect(r.items?.[0].message).toHaveLength(500);
    expect(r.items?.[0].stack).toHaveLength(4000);
    expect(r.items?.[0].url).toHaveLength(500);
    expect(r.items?.[0].userAgent).toHaveLength(300);
  });
  it('accepts a single report and rejects a missing message', () => {
    expect(parseBatch({ message: 'x' }, ClientErrorSchema).items).toHaveLength(1);
    expect(parseBatch({ stack: 'x' }, ClientErrorSchema).error?.status).toBe(400);
  });
});

describe('reportClientError', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    __resetErrorReporter();
    fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    // force the fetch path
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: undefined, userAgent: 'test-ua' });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function sentEvents(): Array<{ message: string; kind: string }> {
    return fetchMock.mock.calls.flatMap((c) => JSON.parse((c[1] as RequestInit).body as string).events);
  }

  it('dedupes, filters noise, and batches to /api/errors', () => {
    const boom = () => Object.assign(new Error('boom'), { stack: V8_STACK });
    expect(reportClientError(boom())).toBe(true);
    expect(reportClientError(boom())).toBe(false); // same message+stack
    expect(reportClientError(new Error('ResizeObserver loop limit exceeded'))).toBe(false);
    expect(reportClientError('string rejection', { kind: 'unhandledrejection' })).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/errors');
    const events = sentEvents();
    expect(events.map((e) => e.message)).toEqual(['boom', 'string rejection']);
    expect(events[1].kind).toBe('unhandledrejection');
  });

  it(`caps at ${MAX_CLIENT_REPORTS_PER_SESSION} reports per session`, () => {
    for (let i = 0; i < 25; i++) reportClientError(`error ${i}`);
    vi.advanceTimersByTime(5000);
    expect(sentEvents()).toHaveLength(MAX_CLIENT_REPORTS_PER_SESSION);
  });
});
