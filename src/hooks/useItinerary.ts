'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { trackItineraryHideEvent } from '@/lib/analytics';

function getLocalUpdatedAt(): number {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.ITINERARY_UPDATED);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

function setLocalUpdatedAt(ts: number) {
  try {
    localStorage.setItem(STORAGE_KEYS.ITINERARY_UPDATED, String(ts));
  } catch {
    // ignore
  }
}

function getLocalHiddenUpdatedAt(): number {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.HIDDEN_EVENTS_UPDATED);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

function setLocalHiddenUpdatedAt(ts: number) {
  try {
    localStorage.setItem(STORAGE_KEYS.HIDDEN_EVENTS_UPDATED, String(ts));
  } catch {
    // ignore
  }
}

export function useItinerary() {
  const { user, loading: authLoading } = useAuth();
  const [itinerary, setItinerary] = useState<Set<string>>(new Set());
  const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const initialSyncDone = useRef(false);
  const skipNextPush = useRef(false);
  const skipNextHiddenPush = useRef(false);
  // Track whether a clear is due to logout so we skip persisting the empty set
  const clearingForLogout = useRef(false);

  // Load from localStorage only when a user is authenticated
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs from external auth state + localStorage, coupled to the Supabase sync state machine below (refs); refactor is high-risk
      setReady(false); // Wait for Supabase sync before ready
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.ITINERARY);
        if (saved) {
          setItinerary(new Set(JSON.parse(saved)));
        }
      } catch {
        // Ignore parse errors
      }
      try {
        const savedHidden = localStorage.getItem(STORAGE_KEYS.HIDDEN_EVENTS);
        if (savedHidden) {
          setHiddenEvents(new Set(JSON.parse(savedHidden)));
        }
      } catch {
        // Ignore parse errors
      }
    } else {
      // User is logged out — clear displayed itinerary (keep localStorage intact)
      clearingForLogout.current = true;
      setItinerary(new Set());
      setHiddenEvents(new Set());
      setReady(true);
    }
    setLoaded(true);
  }, [user, authLoading]);

  // Sync with Supabase when user logs in
  useEffect(() => {
    if (!user || !loaded) return;

    initialSyncDone.current = false;

    async function syncWithSupabase() {
      try {
        const { data } = await supabase
          .from('itineraries')
          .select('event_ids, hidden_event_ids, updated_at')
          .eq('user_id', user!.id)
          .maybeSingle();

        if (data?.event_ids) {
          const serverTime = data.updated_at
            ? new Date(data.updated_at).getTime()
            : 0;
          const localTime = getLocalUpdatedAt();

          if (serverTime >= localTime) {
            // Server is newer or equal — replace local with server data
            skipNextPush.current = true;
            setItinerary(new Set(data.event_ids));
            setLocalUpdatedAt(serverTime);
          }
          // else: local is newer — keep local, will push to server on next save
        }

        if (data?.hidden_event_ids) {
          const serverTime = data.updated_at
            ? new Date(data.updated_at).getTime()
            : 0;
          const localHiddenTime = getLocalHiddenUpdatedAt();

          if (serverTime >= localHiddenTime) {
            skipNextHiddenPush.current = true;
            setHiddenEvents(new Set(data.hidden_event_ids));
            setLocalHiddenUpdatedAt(serverTime);
          }
        }
      } catch {
        // Error fetching — proceed with local data only
      }
      initialSyncDone.current = true;
      setReady(true);
    }

    syncWithSupabase();
  }, [user, loaded]);

  // Save itinerary to localStorage + Supabase on change
  useEffect(() => {
    if (!loaded) return;

    // Don't overwrite localStorage when clearing due to logout
    if (clearingForLogout.current) {
      clearingForLogout.current = false;
      return;
    }

    localStorage.setItem(
      STORAGE_KEYS.ITINERARY,
      JSON.stringify([...itinerary])
    );

    // Skip the push triggered by replacing local with server data
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }

    if (user && initialSyncDone.current) {
      const now = new Date().toISOString();
      setLocalUpdatedAt(new Date(now).getTime());

      supabase
        .from('itineraries')
        .upsert(
          {
            user_id: user.id,
            event_ids: [...itinerary],
            updated_at: now,
          },
          { onConflict: 'user_id' }
        )
        .then(({ error }) => {
          if (error) console.error('Failed to sync itinerary:', error);
        });
    }
  }, [itinerary, loaded, user]);

  // Save hiddenEvents to localStorage + Supabase on change
  useEffect(() => {
    if (!loaded) return;

    // Don't overwrite localStorage when clearing due to logout
    if (clearingForLogout.current) {
      // Already handled by the itinerary effect above
      return;
    }

    localStorage.setItem(
      STORAGE_KEYS.HIDDEN_EVENTS,
      JSON.stringify([...hiddenEvents])
    );

    // Skip the push triggered by replacing local with server data
    if (skipNextHiddenPush.current) {
      skipNextHiddenPush.current = false;
      return;
    }

    if (user && initialSyncDone.current) {
      const now = new Date().toISOString();
      setLocalHiddenUpdatedAt(new Date(now).getTime());

      supabase
        .from('itineraries')
        .upsert(
          {
            user_id: user.id,
            hidden_event_ids: [...hiddenEvents],
            updated_at: now,
          },
          { onConflict: 'user_id' }
        )
        .then(({ error }) => {
          if (error) console.error('Failed to sync hidden events:', error);
        });
    }
  }, [hiddenEvents, loaded, user]);

  const add = useCallback((eventId: string) => {
    setItinerary((prev) => {
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
  }, []);

  const remove = useCallback((eventId: string) => {
    setItinerary((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
    // Also remove from hidden events to avoid stale entries
    setHiddenEvents((prev) => {
      if (!prev.has(eventId)) return prev;
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  }, []);

  const toggle = useCallback((eventId: string) => {
    setItinerary((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
        // Also remove from hidden events when un-starring
        setHiddenEvents((prevHidden) => {
          if (!prevHidden.has(eventId)) return prevHidden;
          const nextHidden = new Set(prevHidden);
          nextHidden.delete(eventId);
          return nextHidden;
        });
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  const isInItinerary = useCallback(
    (eventId: string) => itinerary.has(eventId),
    [itinerary]
  );

  const addMany = useCallback((eventIds: string[]) => {
    setItinerary((prev) => {
      const next = new Set(prev);
      for (const id of eventIds) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItinerary(new Set());
    setHiddenEvents(new Set());
  }, []);

  const reorder = useCallback((orderedIds: string[]) => {
    setItinerary(new Set(orderedIds));
  }, []);

  const toggleHidden = useCallback((eventId: string) => {
    setHiddenEvents((prev) => {
      const next = new Set(prev);
      const nowHidden = !next.has(eventId);
      if (nowHidden) {
        next.add(eventId);
      } else {
        next.delete(eventId);
      }
      trackItineraryHideEvent(nowHidden);
      return next;
    });
  }, []);

  const isHidden = useCallback(
    (eventId: string) => hiddenEvents.has(eventId),
    [hiddenEvents]
  );

  return {
    itinerary,
    add,
    addMany,
    remove,
    toggle,
    isInItinerary,
    clear,
    reorder,
    count: itinerary.size,
    ready,
    hiddenEvents,
    toggleHidden,
    isHidden,
    hiddenCount: hiddenEvents.size,
  };
}
