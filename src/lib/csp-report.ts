/**
 * Parsing helpers for Content-Security-Policy violation reports.
 *
 * Browsers send two formats:
 *  - legacy `report-uri`: Content-Type `application/csp-report`, body
 *    `{"csp-report": {"document-uri": ..., "violated-directive": ..., ...}}`
 *  - Reporting API `report-to`: Content-Type `application/reports+json`, body
 *    `[{"type": "csp-violation", "url": ..., "body": {"documentURL": ..., "effectiveDirective": ..., ...}}]`
 */

export const CSP_REPORT_MAX_BYTES = 10 * 1024;
const MAX_REPORTS = 10;
const MAX_FIELD = 200;

export interface CompactCspViolation {
  directive: string;
  blocked: string;
  page: string;
  source?: string;
  disposition?: string;
}

function str(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, MAX_FIELD);
  if (typeof v === 'number') return String(v);
  return '';
}

/** Strip query/fragment from URLs so tokens and PII in query strings aren't logged. */
export function stripUrl(v: string): string {
  if (!/^https?:\/\//i.test(v)) return v;
  try {
    const u = new URL(v);
    return `${u.origin}${u.pathname}`.slice(0, MAX_FIELD);
  } catch {
    return v.slice(0, MAX_FIELD);
  }
}

function compact(r: Record<string, unknown>): CompactCspViolation | null {
  const directive = str(r['effectiveDirective'] ?? r['effective-directive'] ?? r['violated-directive']);
  if (!directive) return null;
  const blocked = stripUrl(str(r['blockedURL'] ?? r['blocked-uri']));
  const page = stripUrl(str(r['documentURL'] ?? r['document-uri']));
  const file = stripUrl(str(r['sourceFile'] ?? r['source-file']));
  const line = str(r['lineNumber'] ?? r['line-number']);
  const out: CompactCspViolation = { directive, blocked: blocked || '(none)', page };
  if (file) out.source = line ? `${file}:${line}` : file;
  const disposition = str(r['disposition']);
  if (disposition) out.disposition = disposition;
  return out;
}

/** Parse a raw CSP report body (either format) into compact violations. */
export function parseCspReports(raw: string): CompactCspViolation[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const out: CompactCspViolation[] = [];
  if (Array.isArray(data)) {
    for (const item of data.slice(0, MAX_REPORTS)) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (rec.type !== 'csp-violation') continue;
      const body = rec.body;
      if (body && typeof body === 'object') {
        const c = compact(body as Record<string, unknown>);
        if (c) out.push(c);
      }
    }
  } else if (data && typeof data === 'object') {
    const body = (data as Record<string, unknown>)['csp-report'];
    if (body && typeof body === 'object') {
      const c = compact(body as Record<string, unknown>);
      if (c) out.push(c);
    }
  }
  return out;
}

/** Read a request body as text, aborting once it exceeds maxBytes. Returns null if too large. */
export async function readCappedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes = CSP_REPORT_MAX_BYTES
): Promise<string | null> {
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}
