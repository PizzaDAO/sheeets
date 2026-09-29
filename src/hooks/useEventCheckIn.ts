'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { passesNowFilter, getConferenceNow } from '@/lib/filters';
import { trackCheckIn } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import type { ETHDenverEvent } from '@/lib/types';

interface CheckInResult {
  ok: boolean;
  message: string;
}

async function tryGetPosition(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return null;
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
      })
    );
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

export function useEventCheckIn() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);

  const clearResult = useCallback(() => setResult(null), []);

  const checkInToEvent = useCallback(
    async (eventId: string, eventName?: string) => {
      if (!user) return;
      setLoading(true);
      setResult(null);

      try {
        const coords = await tryGetPosition();

        const { error } = await supabase.from('check_ins').upsert(
          [{ user_id: user.id, event_id: eventId, lat: coords?.lat ?? null, lng: coords?.lng ?? null }],
          { onConflict: 'user_id,event_id' }
        );

        if (error) throw error;

        trackCheckIn(eventId, true);
        setResult({
          ok: true,
          message: eventName ? `Checked in at ${eventName}!` : 'Checked in!',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Check-in failed';
        trackCheckIn(eventId, false);
        setResult({ ok: false, message: msg });
      }

      setLoading(false);
    },
    [user]
  );

  const checkInToNearbyEvents = useCallback(
    async (
      events: ETHDenverEvent[],
      itinerary: Set<string>,
      conference?: string
    ) => {
      if (!user) return;
      setLoading(true);
      setResult(null);

      try {
        const now = getConferenceNow(conference);

        // Get live itinerary events
        const liveItinerary = events.filter((e) => {
          if (!itinerary.has(e.id)) return false;
          if (!passesNowFilter(e, now)) return false;
          return true;
        });

        if (liveItinerary.length === 0) {
          setResult({ ok: false, message: 'No active itinerary events right now' });
          setLoading(false);
          return;
        }

        const coords = await tryGetPosition();

        const rows = liveItinerary.map((e) => ({
          user_id: user.id,
          event_id: e.id,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        }));

        const { error } = await supabase.from('check_ins').upsert(rows, {
          onConflict: 'user_id,event_id',
        });

        if (error) throw error;

        for (const e of liveItinerary) {
          trackCheckIn(e.id, true);
        }

        const names = liveItinerary.map((e) => e.name).join(', ');
        setResult({
          ok: true,
          message: `Checked in at ${names}!`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Check-in failed';
        setResult({ ok: false, message: msg });
      }

      setLoading(false);
    },
    [user]
  );

  return { checkInToEvent, checkInToNearbyEvents, loading, result, clearResult };
}
