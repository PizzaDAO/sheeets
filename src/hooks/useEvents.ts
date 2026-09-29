'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ETHDenverEvent } from '@/lib/types';
import { STORAGE_KEYS } from '@/lib/storage-keys';

const STALENESS_MS = 5 * 60 * 1000; // 5 minutes

function readCache(): ETHDenverEvent[] | null {
  try {
    const ts = sessionStorage.getItem(STORAGE_KEYS.EVENTS_CACHE_TS);
    if (!ts || Date.now() - Number(ts) > STALENESS_MS) return null;
    const raw = sessionStorage.getItem(STORAGE_KEYS.EVENTS_CACHE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(events: ETHDenverEvent[]) {
  try {
    sessionStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(events));
    sessionStorage.setItem(STORAGE_KEYS.EVENTS_CACHE_TS, String(Date.now()));
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

function readStaleCache(): ETHDenverEvent[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.EVENTS_CACHE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<ETHDenverEvent[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  return res.json();
}

/** Replace all events of `conference` in `prev` with `next`. */
function mergeConference(prev: ETHDenverEvent[], conference: string, next: ETHDenverEvent[]) {
  return [...prev.filter((e) => e.conference !== conference), ...next];
}

/**
 * Client-side events store.
 *
 * - Without `initialEvents` (itinerary pages): loads ALL events on mount
 *   (sessionStorage cache first, then /api/events).
 * - With `initialEvents` (conference page, server-rendered): uses the server
 *   data as-is and does NOT refetch on mount. Other conferences are fetched
 *   on demand via /api/events?conference=... when `conference` changes, and
 *   the full list is only fetched when `loadAll()` is called (e.g. onboarding
 *   needs counts for every conference). The current conference is
 *   revalidated in the background when the tab becomes visible again after
 *   the data is older than 5 minutes.
 */
export function useEvents(initialEvents?: ETHDenverEvent[], conference?: string) {
  const [events, setEvents] = useState<ETHDenverEvent[]>(initialEvents ?? []);
  const [loading, setLoading] = useState(!initialEvents);
  const [error, setError] = useState<string | null>(null);

  // Tracks which conferences we hold fresh-enough data for (name -> fetched at).
  const loadedAt = useRef<Map<string, number>>(new Map());
  const allLoaded = useRef(false);
  const inFlight = useRef<Set<string>>(new Set());
  const hasInitial = useRef(!!initialEvents);
  const initialConference = useRef(conference);

  const loadAll = useCallback(async () => {
    if (allLoaded.current || inFlight.current.has('*')) return;

    const cached = readCache();
    if (cached) {
      allLoaded.current = true;
      // Prefer data we already hold for loaded conferences (it may be newer).
      setEvents((prev) => {
        const held = new Set(loadedAt.current.keys());
        return [...cached.filter((e) => !held.has(e.conference)), ...prev.filter((e) => held.has(e.conference))];
      });
      return;
    }

    inFlight.current.add('*');
    try {
      const data = await fetchJson('/api/events');
      writeCache(data);
      allLoaded.current = true;
      const now = Date.now();
      for (const e of data) loadedAt.current.set(e.conference, now);
      setEvents(data);
    } catch (e) {
      const stale = readStaleCache();
      if (stale && !hasInitial.current) {
        setEvents(stale);
      } else if (!hasInitial.current) {
        setError(e instanceof Error ? e.message : 'Failed to load events');
      }
    } finally {
      inFlight.current.delete('*');
    }
  }, []);

  const loadConference = useCallback(async (conf: string) => {
    if (inFlight.current.has(conf)) return;
    inFlight.current.add(conf);
    try {
      const data = await fetchJson(`/api/events?conference=${encodeURIComponent(conf)}`);
      loadedAt.current.set(conf, Date.now());
      setEvents((prev) => mergeConference(prev, conf, data));
    } catch (e) {
      console.warn(`Failed to load events for ${conf}:`, e);
    } finally {
      inFlight.current.delete(conf);
    }
  }, []);

  // Mount
  useEffect(() => {
    if (hasInitial.current) {
      // Server data is fresh — no refetch.
      if (initialConference.current) {
        loadedAt.current.set(initialConference.current, Date.now());
      }
      // If a fresh full list is already in sessionStorage (e.g. from the
      // itinerary page), use it for the other conferences at no network cost.
      if (readCache()) loadAll();
      return;
    }

    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  // On-demand: fetch a conference we don't have yet.
  useEffect(() => {
    if (!hasInitial.current || !conference || allLoaded.current) return;
    if (loadedAt.current.has(conference)) return;
    loadConference(conference);
  }, [conference, loadConference]);

  // Background revalidation of the current conference for long-lived tabs.
  useEffect(() => {
    if (!hasInitial.current || !conference) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const ts = loadedAt.current.get(conference);
      if (ts === undefined || Date.now() - ts > STALENESS_MS) loadConference(conference);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [conference, loadConference]);

  return { events, loading, error, loadAll };
}
