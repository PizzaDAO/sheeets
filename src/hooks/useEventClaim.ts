'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { PublicClaim } from '@/lib/host-claims';

export interface HostApiResult<T> {
  ok: boolean;
  status: number;
  data: T & { error?: string; retry_after?: number };
}

/** Call a /api/host/* route with the signed-in user's Supabase access token. */
export async function hostApi<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<HostApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as HostApiResult<T>['data'];
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Network error. Try again.' } as HostApiResult<T>['data'] };
  }
}

/**
 * The signed-in user's open (pending/verified) claim on one event.
 * `claim` is null when there is none (or the user is signed out).
 */
export function useEventClaim(eventId: string, enabled = true) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Keyed by user+event so a stale result never shows for another event/user.
  const [state, setState] = useState<{ key: string; claim: PublicClaim | null } | null>(null);
  const key = `${userId}:${eventId}`;

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    hostApi<{ claims?: PublicClaim[] }>(`/api/host/claims?eventId=${encodeURIComponent(eventId)}`).then((r) => {
      if (cancelled) return;
      setState({ key: `${userId}:${eventId}`, claim: r.ok ? r.data.claims?.[0] ?? null : null });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, eventId]);

  const setClaim = useCallback(
    (claim: PublicClaim | null) => setState({ key, claim }),
    [key]
  );

  const current = userId && state?.key === key ? state.claim : null;
  return { claim: current, setClaim, loaded: !userId || state?.key === key };
}
