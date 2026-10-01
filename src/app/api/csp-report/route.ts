import { NextRequest } from 'next/server';
import { CSP_REPORT_MAX_BYTES, parseCspReports, readCappedBody } from '@/lib/csp-report';

/**
 * Receives CSP violation reports (report-uri and report-to formats) and logs a
 * compact `[csp]` line per violation to the function logs. No DB writes.
 */
const ACCEPTED_TYPES = ['application/csp-report', 'application/reports+json', 'application/json'];

export async function POST(req: NextRequest) {
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!ACCEPTED_TYPES.includes(type)) {
    return new Response(null, { status: 415 });
  }
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > CSP_REPORT_MAX_BYTES) {
    return new Response(null, { status: 413 });
  }
  const raw = await readCappedBody(req.body);
  if (raw === null) {
    return new Response(null, { status: 413 });
  }
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 120);
  for (const v of parseCspReports(raw)) {
    console.warn(`[csp] ${JSON.stringify({ ...v, ua })}`);
  }
  return new Response(null, { status: 204 });
}
