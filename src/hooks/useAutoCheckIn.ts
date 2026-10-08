'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { trackCheckIn } from '@/lib/analytics';
import { updateDwell, type DwellCandidateEvent } from '@/lib/auto-checkin';
import type { ETHDenverEvent } from '@/lib/types';

/** Minimum gap between processing raw position fixes. */
const FIX_THROTTLE_MS = 10_000;
/** Re-evaluate the last fix this often so a stationary user crosses the dwell threshold. */
const TICK_MS = 15_000;

export interface AutoCheckInToast {
  eventId: string;
  eventName: string;
}

interface UseAutoCheckInArgs {
  /** profiles.auto_check_in */
  enabled: boolean;
  /** Live events in the user's plan (the hook ignores ones without coordinates). */
  liveItineraryEvents: ETHDenverEvent[];
}

/**
 * Opt-in auto check-in. Feed it position fixes from the existing proximity
 * watcher via `handlePosition`. When the user stays within 150m of a live plan
 * event for 90s, a check-in is created and `toast` is set (with `undo`).
 * Events the user undid, or that were already checked in, are never
 * auto-checked-in again this session. Only runs while the app is open.
 */
export function useAutoCheckIn({ enabled, liveItineraryEvents }: UseAutoCheckInArgs) {
  const { user } = useAuth();
  const userId = user?.id;
  const [toast, setToast] = useState<AutoCheckInToast | null>(null);

  const dwellRef = useRef<Map<string, number>>(new Map());
  const lastFixRef = useRef<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const lastProcessedRef = useRef(0);
  /** Session-local: auto-checked, undone, or already-checked-in event ids. */
  const excludeRef = useRef<Set<string>>(new Set());
  const candidatesRef = useRef<{ list: DwellCandidateEvent[]; names: Map<string, string> }>({ list: [], names: new Map() });
  const enabledRef = useRef(false);
  const userIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const list: DwellCandidateEvent[] = [];
    const names = new Map<string, string>();
    for (const e of liveItineraryEvents) {
      if (e.lat == null || e.lng == null) continue;
      list.push({ id: e.id, lat: e.lat, lng: e.lng });
      names.set(e.id, e.name);
    }
    candidatesRef.current = { list, names };
  }, [liveItineraryEvents]);

  useEffect(() => {
    enabledRef.current = enabled && !!userId;
    if (!enabledRef.current) dwellRef.current = new Map();
  }, [enabled, userId]);

  useEffect(() => {
    if (userIdRef.current !== userId) {
      userIdRef.current = userId;
      excludeRef.current = new Set();
      dwellRef.current = new Map();
    }
  }, [userId]);

  const checkIn = useCallback(async (eventId: string) => {
    const uid = userIdRef.current;
    if (!uid) return;
    excludeRef.current.add(eventId);

    // Already checked in (manually or in a previous session)? Stay quiet.
    const { data: existing, error: existingError } = await supabase
      .from('check_ins')
      .select('event_id')
      .eq('user_id', uid)
      .eq('event_id', eventId)
      .maybeSingle();
    if (existingError) {
      console.error('Auto check-in lookup failed:', existingError);
      return;
    }
    if (existing) return;

    const fix = lastFixRef.current;
    const { error } = await supabase.from('check_ins').insert({
      user_id: uid,
      event_id: eventId,
      lat: fix?.lat ?? null,
      lng: fix?.lng ?? null,
    });
    if (error) {
      console.error('Auto check-in failed:', error);
      trackCheckIn(eventId, false);
      return;
    }
    trackCheckIn(eventId, true);
    setToast({ eventId, eventName: candidatesRef.current.names.get(eventId) ?? 'this event' });
  }, []);

  const evaluate = useCallback(() => {
    const fix = lastFixRef.current;
    if (!enabledRef.current || !fix) return;
    const { state, ready } = updateDwell(
      dwellRef.current,
      fix,
      candidatesRef.current.list,
      Date.now(),
      { exclude: excludeRef.current },
    );
    dwellRef.current = state;
    for (const id of ready) void checkIn(id);
  }, [checkIn]);

  /** Stable callback for the geolocation watcher. */
  const handlePosition = useCallback(
    (pos: GeolocationPosition) => {
      lastFixRef.current = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
      };
      const now = Date.now();
      if (now - lastProcessedRef.current < FIX_THROTTLE_MS) return;
      lastProcessedRef.current = now;
      evaluate();
    },
    [evaluate]
  );

  // Periodic re-evaluation while a dwell timer is running.
  useEffect(() => {
    if (!enabled || !userId) return;
    const interval = setInterval(() => {
      if (dwellRef.current.size > 0) evaluate();
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [enabled, userId, evaluate]);

  const dismiss = useCallback(() => setToast(null), []);

  const undo = useCallback(async () => {
    const uid = userIdRef.current;
    const current = toast;
    setToast(null);
    if (!uid || !current) return;
    excludeRef.current.add(current.eventId);
    const { data: deleted, error } = await supabase
      .from('check_ins')
      .delete()
      .eq('user_id', uid)
      .eq('event_id', current.eventId)
      .select('event_id');
    if (error || !deleted || deleted.length === 0) {
      // RLS silently blocks deletes without a policy (0 rows): fall back to checking out.
      const { error: outError } = await supabase
        .from('check_ins')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('user_id', uid)
        .eq('event_id', current.eventId);
      if (outError) console.error('Failed to undo auto check-in:', outError);
    }
  }, [toast]);

  return { handlePosition, toast, undo, dismiss };
}
