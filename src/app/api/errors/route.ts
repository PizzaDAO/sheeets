import { NextRequest, NextResponse } from 'next/server';
import { ClientErrorSchema, parseBatch } from '@/lib/api-validation';
import { MAX_ERROR_BATCH, MAX_ERROR_BODY_BYTES, isNoiseError } from '@/lib/error-monitoring';
import { recordAppErrors } from '@/lib/error-store';

/**
 * Client error reports from src/lib/error-reporter.ts.
 *
 * Body: a single report OR `{ events: [...] }` (up to 20, sent via
 * sendBeacon by the tracking queue). Body capped at 32KB. Each report is
 * aggregated by fingerprint into `app_errors` via record_app_error().
 *
 * If the table/function isn't deployed yet, responds 202 and warns.
 */
export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_ERROR_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (Buffer.byteLength(text) > MAX_ERROR_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseBatch(raw, ClientErrorSchema, MAX_ERROR_BATCH);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });
  }

  // Re-apply the noise filter server-side (old/modified clients)
  const items = parsed.items.filter((e) => !isNoiseError({ message: e.message, stack: e.stack }));
  if (items.length === 0) {
    return NextResponse.json({ success: true, recorded: 0 });
  }

  const userAgent = req.headers.get('user-agent');
  const result = await recordAppErrors(
    items.map((e) => ({
      source: 'client' as const,
      message: e.message,
      stack: e.stack,
      url: e.url,
      route: e.route,
      userAgent: e.userAgent || userAgent,
    }))
  );

  if (!result.ok) {
    if (result.missing) {
      console.warn('[api/errors] app_errors not deployed yet; dropping reports:', result.error);
      return NextResponse.json({ success: true, recorded: 0, note: 'table not yet created' }, { status: 202 });
    }
    console.error('[api/errors] failed to record:', result.error);
    return NextResponse.json({ error: 'Failed to record' }, { status: 500 });
  }

  return NextResponse.json({ success: true, recorded: result.recorded });
}
