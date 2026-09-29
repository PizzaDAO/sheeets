import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress, LookupAllOptions } from 'node:dns';
import type { Readable } from 'node:stream';

/**
 * SSRF-safe server-side fetch for user-supplied URLs.
 *
 * - Only http: / https: URLs are allowed.
 * - Every hostname is resolved via DNS *at connect time* (custom `lookup`),
 *   and the request is refused if ANY resolved address is private, loopback,
 *   link-local (incl. 169.254.169.254 metadata), CGNAT, multicast, reserved or
 *   unspecified — for both IPv4 and IPv6 (incl. IPv4-mapped IPv6). Validating
 *   inside `lookup` means the address we check is the address we connect to,
 *   so DNS rebinding between "check" and "connect" is not possible.
 * - Redirects are followed manually (max 5) and each hop is re-validated.
 * - Whole request is bounded by a timeout and the body is capped in size.
 */

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  /** Total time budget across all redirect hops (ms). Default 8000. */
  timeoutMs?: number;
  /** Max body bytes to read (after decompression). Default 2MB. */
  maxBytes?: number;
  /** Max redirects to follow. Default 5. */
  maxRedirects?: number;
  /**
   * Optional early-stop predicate, checked after each chunk with the text
   * read so far. Returning true stops reading (e.g. once `</head>` is seen).
   */
  stopWhen?: (textSoFar: string) => boolean;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  /** Final URL after redirects */
  url: string;
  headers: http.IncomingHttpHeaders;
  /** Body text, truncated to `maxBytes` */
  text: string;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this" network / unspecified
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. cloud metadata 169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

const BLOCKED_V4_RANGES = BLOCKED_V4.map(([base, bits]) => {
  const start = ipv4ToInt(base)!;
  const size = 2 ** (32 - bits);
  return { start, end: start + size - 1 };
});

function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable -> refuse
  return BLOCKED_V4_RANGES.some((r) => n >= r.start && n <= r.end);
}

/** Expand an IPv6 address (optionally with trailing dotted IPv4) to 8 16-bit groups. */
function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf('%');
  if (zone !== -1) addr = addr.slice(0, zone);

  // Trailing dotted IPv4 (e.g. ::ffff:127.0.0.1) -> rewrite as two hex groups
  const lastColon = addr.lastIndexOf(':');
  const tail = addr.slice(lastColon + 1);
  if (tail.includes('.')) {
    const n = ipv4ToInt(tail);
    if (n === null) return null;
    addr = addr.slice(0, lastColon + 1) + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16);
  }

  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const parse = (s: string) => (s === '' ? [] : s.split(':'));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const totalWanted = 8;
  let groups: string[];
  if (halves.length === 2) {
    const fill = totalWanted - head.length - rest.length;
    if (fill < 0) return null;
    groups = [...head, ...Array(fill).fill('0'), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function groupsToIPv4(hi: number, lo: number): string {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
}

function isBlockedIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return true; // unparseable -> refuse

  const allZeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);

  // :: (unspecified) and ::1 (loopback)
  if (allZeroPrefix(7) && (g[7] === 0 || g[7] === 1)) return true;
  // IPv4-mapped ::ffff:a.b.c.d -> classify the embedded IPv4
  if (allZeroPrefix(5) && g[5] === 0xffff) return isBlockedIPv4(groupsToIPv4(g[6], g[7]));
  // IPv4-compatible (deprecated) ::a.b.c.d
  if (allZeroPrefix(6)) return true;
  // IPv4/IPv6 translation 64:ff9b::/96 and 64:ff9b:1::/48 -> classify embedded IPv4
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    if (g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
      return isBlockedIPv4(groupsToIPv4(g[6], g[7]));
    }
    if (g[2] === 1) return true;
  }
  // 6to4 2002::/16 -> classify embedded IPv4
  if (g[0] === 0x2002) return isBlockedIPv4(groupsToIPv4(g[1], g[2]));
  // Discard-only 100::/64
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true;
  // Documentation 2001:db8::/32
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true;
  // Unique local fc00::/7
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  // Link-local fe80::/10 and deprecated site-local fec0::/10
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true;
  // Multicast ff00::/8
  if ((g[0] & 0xff00) === 0xff00) return true;

  return false;
}

/** True if the IP literal must not be contacted from the server. */
export function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true;
}

// ---------------------------------------------------------------------------
// Guarded DNS lookup (used by http(s).request at connect time)
// ---------------------------------------------------------------------------

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number
) => void;

function guardedLookup(
  hostname: string,
  options: { family?: number | string; all?: boolean; hints?: number },
  callback: LookupCallback
): void {
  const opts: LookupAllOptions = {
    all: true,
    verbatim: true,
    hints: options.hints,
    family: options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : (options.family as 0 | 4 | 6 | undefined),
  };
  dnsLookup(hostname, opts, (err, addresses) => {
    if (err) return callback(err, [] as LookupAddress[]);
    if (!addresses.length) {
      return callback(new SafeFetchError('Host did not resolve.'), [] as LookupAddress[]);
    }
    if (addresses.some((a) => isBlockedIp(a.address))) {
      return callback(
        new SafeFetchError('Refusing to connect to a private or reserved address.'),
        [] as LookupAddress[]
      );
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/** Parse and validate a user-supplied URL (http/https only, no credentials). */
export function parsePublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SafeFetchError('Invalid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SafeFetchError('Only http and https URLs are allowed.');
  }
  if (u.username || u.password) {
    throw new SafeFetchError('URLs with credentials are not allowed.');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new SafeFetchError('Invalid URL.');
  // Fail fast on IP literals (the connect-time lookup would also catch these)
  if (net.isIP(host) && isBlockedIp(host)) {
    throw new SafeFetchError('Refusing to connect to a private or reserved address.');
  }
  return u;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

function requestOnce(
  u: URL,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      u,
      {
        method: 'GET',
        headers,
        lookup: guardedLookup as unknown as net.LookupFunction,
        signal,
      },
      resolve
    );
    req.on('error', reject);
    req.end();
  });
}

function decodedStream(res: http.IncomingMessage): Readable {
  const enc = String(res.headers['content-encoding'] || '').toLowerCase().trim();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (enc === 'deflate') return res.pipe(zlib.createInflate());
  if (enc === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
}

async function readCapped(
  res: http.IncomingMessage,
  maxBytes: number,
  stopWhen?: (textSoFar: string) => boolean
): Promise<string> {
  const stream = decodedStream(res);
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      const remaining = maxBytes - bytes;
      const piece = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      bytes += piece.length;
      text += decoder.decode(piece, { stream: true });
      if (bytes >= maxBytes) break;
      if (stopWhen && stopWhen(text)) break;
    }
  } finally {
    res.destroy();
    if (stream !== res) stream.destroy();
  }
  return text + decoder.decode();
}

/**
 * GET a user-supplied URL safely. Throws `SafeFetchError` (with a message that
 * is safe to show clients) on policy violations; network errors are rethrown
 * as a generic SafeFetchError so upstream details are not leaked.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    stopWhen,
  } = options;

  const signal = AbortSignal.timeout(timeoutMs);
  const reqHeaders: Record<string, string> = {
    'Accept-Encoding': 'gzip, deflate, br',
    ...headers,
  };

  let current = parsePublicHttpUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res: http.IncomingMessage;
    try {
      res = await requestOnce(current, reqHeaders, signal);
    } catch (err) {
      if (err instanceof SafeFetchError) throw err;
      if (signal.aborted) throw new SafeFetchError('Request timed out.');
      throw new SafeFetchError('Could not reach the URL.');
    }

    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location) {
      res.destroy();
      let next: string;
      try {
        next = new URL(location, current).href;
      } catch {
        throw new SafeFetchError('Invalid redirect.');
      }
      current = parsePublicHttpUrl(next);
      continue;
    }

    let text: string;
    try {
      text = await readCapped(res, maxBytes, stopWhen);
    } catch {
      if (signal.aborted) throw new SafeFetchError('Request timed out.');
      throw new SafeFetchError('Could not read the response.');
    }

    return {
      ok: status >= 200 && status < 300,
      status,
      url: current.href,
      headers: res.headers,
      text,
    };
  }

  throw new SafeFetchError('Too many redirects.');
}
