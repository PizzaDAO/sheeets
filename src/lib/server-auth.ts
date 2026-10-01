import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

/** Service-role Supabase client for API routes (bypasses RLS — server only). */
export function getServiceSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Extract a bearer token from the Authorization header, if well-formed. */
export function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(header.trim());
  return m ? m[1] : null;
}

/**
 * Authenticate the signed-in user from `Authorization: Bearer <access_token>`
 * (the Supabase session access token). The token is verified by Supabase Auth
 * (`auth.getUser`), so a forged or expired JWT is rejected.
 *
 * Returns `{ user }` or `{ error }` (a 401 response to return as-is).
 */
export async function getUserFromRequest(
  req: NextRequest
): Promise<{ user: User; error?: never } | { user?: never; error: NextResponse }> {
  const unauthorized = () => ({
    error: NextResponse.json({ error: 'Sign in required' }, { status: 401 }),
  });
  const token = getBearerToken(req);
  if (!token) return unauthorized();
  try {
    const { data, error } = await getServiceSupabase().auth.getUser(token);
    if (error || !data?.user) return unauthorized();
    return { user: data.user };
  } catch {
    return unauthorized();
  }
}
