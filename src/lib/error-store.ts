import { createHash } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ERROR_FIELD_LIMITS,
  fingerprintInput,
  truncate,
  type ErrorSource,
} from '@/lib/error-monitoring';

/**
 * Server-side persistence for app errors (table `app_errors`, migration
 * supabase/migrations/20261001120000_app_errors.sql). Used by both
 * /api/errors (client reports) and src/instrumentation.ts (server errors).
 */

export interface AppErrorInput {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  url?: string | null;
  route?: string | null;
  userAgent?: string | null;
}

export type RecordResult =
  | { ok: true; recorded: number }
  | { ok: false; missing: true; error: string }
  | { ok: false; missing?: false; error: string };

/** SHA-1 of message + first stack frame + source. */
export function fingerprintError(message: string, stack: string | null | undefined, source: ErrorSource): string {
  return createHash('sha1').update(fingerprintInput(message, stack, source)).digest('hex');
}

/** Postgres/PostgREST codes meaning "table or function not deployed yet". */
export function isMissingSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === '42P01' || // undefined_table
    err.code === '42883' || // undefined_function
    err.code === 'PGRST202' || // function not in schema cache
    err.code === 'PGRST205' || // table not in schema cache
    /could not find the function/i.test(err.message || '')
  );
}

let client: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

/**
 * Record errors via the atomic `record_app_error` upsert (one RPC per
 * distinct fingerprint; duplicates within the batch are collapsed into a
 * single call with p_count = n). Never throws.
 */
export async function recordAppErrors(inputs: AppErrorInput[]): Promise<RecordResult> {
  try {
    if (inputs.length === 0) return { ok: true, recorded: 0 };
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: 'supabase not configured' };

    const release = process.env.VERCEL_GIT_COMMIT_SHA || null;
    const grouped = new Map<string, { input: AppErrorInput; count: number }>();
    for (const input of inputs) {
      const message = truncate(input.message, ERROR_FIELD_LIMITS.message) || 'Unknown error';
      const stack = truncate(input.stack, ERROR_FIELD_LIMITS.stack);
      const fp = fingerprintError(message, stack, input.source);
      const existing = grouped.get(fp);
      if (existing) existing.count += 1;
      else grouped.set(fp, { input: { ...input, message, stack }, count: 1 });
    }

    const results = await Promise.all(
      [...grouped].map(([fp, { input, count }]) =>
        supabase.rpc('record_app_error', {
          p_fingerprint: fp,
          p_source: input.source,
          p_message: input.message,
          p_stack: input.stack ?? null,
          p_url: truncate(input.url, ERROR_FIELD_LIMITS.url),
          p_route: truncate(input.route, ERROR_FIELD_LIMITS.route),
          p_user_agent: truncate(input.userAgent, ERROR_FIELD_LIMITS.userAgent),
          p_release: release,
          p_count: count,
        })
      )
    );

    const failed = results.find((r) => r.error)?.error;
    if (failed) {
      if (isMissingSchemaError(failed)) return { ok: false, missing: true, error: failed.message };
      return { ok: false, error: failed.message };
    }
    return { ok: true, recorded: inputs.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function recordAppError(input: AppErrorInput): Promise<RecordResult> {
  return recordAppErrors([input]);
}
