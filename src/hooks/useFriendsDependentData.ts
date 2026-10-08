'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Friend, FriendLocation } from '@/lib/types';
import { getDisplayName } from '@/lib/user-display';
import type { FriendCheckIn } from '@/lib/venue-pins';

interface FriendItinerary {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  xHandle?: string | null;
  eventIds: Set<string>;
}

interface FriendsDependentData {
  friendItineraries: FriendItinerary[];
  checkInCounts: Map<string, number>;
  checkInUsersByEvent: Map<string, string[]>;
  friendLocations: FriendLocation[];
  /** Friends' active check-ins (last 12h, not checked out), refreshed every 2 min while visible. */
  friendCheckIns: FriendCheckIn[];
  /** When friendCheckIns was last fetched (ms) — the "now" for deriving venue pins. */
  friendCheckInsFetchedAt: number;
}

export function useFriendsDependentData(friends: Friend[]): FriendsDependentData {
  const { user, loading: authLoading } = useAuth();

  const [rawItineraries, setRawItineraries] = useState<
    { userId: string; eventIds: string[] }[]
  >([]);
  const [checkInCounts, setCheckInCounts] = useState<Map<string, number>>(new Map());
  const [checkInUsersByEvent, setCheckInUsersByEvent] = useState<Map<string, string[]>>(new Map());
  const [friendLocations, setFriendLocations] = useState<FriendLocation[]>([]);
  const [friendCheckIns, setFriendCheckIns] = useState<FriendCheckIn[]>([]);
  const [friendCheckInsFetchedAt, setFriendCheckInsFetchedAt] = useState(0);

  const initialFetchDone = useRef(false);

  // Single friendIds memo (sorted join)
  const friendIds = useMemo(
    () => friends.map((f) => f.user_id).sort().join(','),
    [friends]
  );

  // ---- Batched fetch: itineraries + check-ins + locations ----
  useEffect(() => {
    if (authLoading) return;

    if (!user || friends.length === 0) {
      setRawItineraries([]);
      setCheckInCounts(new Map());
      setCheckInUsersByEvent(new Map());
      setFriendLocations([]);
      initialFetchDone.current = false;
      return;
    }

    initialFetchDone.current = false;

    async function fetchAll() {
      const userIds = [user!.id, ...friends.map((f) => f.user_id)];

      const [itinResult, checkInResult, locResult] = await Promise.all([
        // 1. Friend itineraries
        supabase.rpc('get_friends_itineraries'),
        // 2. Check-in counts
        supabase.rpc('get_check_in_counts', { p_user_ids: userIds }),
        // 3. Friend locations
        supabase.rpc('get_friends_locations'),
      ]);

      // --- Itineraries ---
      if (itinResult.error) {
        console.error('Failed to fetch friends itineraries:', itinResult.error);
      } else {
        setRawItineraries(
          (itinResult.data ?? []).map((row: { user_id: string; event_ids: string[] }) => ({
            userId: row.user_id,
            eventIds: row.event_ids ?? [],
          }))
        );
      }

      // --- Check-ins ---
      if (!checkInResult.error && checkInResult.data) {
        const counts = new Map<string, number>();
        const usersByEvent = new Map<string, string[]>();
        for (const row of checkInResult.data as { event_id: string; checkin_count: number; user_ids: string[] }[]) {
          counts.set(row.event_id, row.checkin_count);
          const friendsOnly = row.user_ids.filter((uid) => uid !== user!.id);
          if (friendsOnly.length > 0) {
            usersByEvent.set(row.event_id, friendsOnly);
          }
        }
        setCheckInCounts(counts);
        setCheckInUsersByEvent(usersByEvent);
      } else if (checkInResult.error) {
        // Fallback: RPC doesn't exist (error code 42883) or other error
        if (checkInResult.error.code !== '42883') {
          console.error('RPC get_check_in_counts failed, falling back:', checkInResult.error);
        }

        // Legacy: fetch all rows and aggregate client-side
        const { data, error } = await supabase
          .from('check_ins')
          .select('event_id, user_id')
          .in('user_id', userIds);

        if (error) {
          console.error('Failed to fetch check-ins:', error);
        } else {
          const counts = new Map<string, number>();
          const usersByEvent = new Map<string, string[]>();
          for (const row of data ?? []) {
            const { event_id: eid, user_id: uid } = row as { event_id: string; user_id: string };
            counts.set(eid, (counts.get(eid) ?? 0) + 1);
            if (uid !== user!.id) {
              if (!usersByEvent.has(eid)) usersByEvent.set(eid, []);
              usersByEvent.get(eid)!.push(uid);
            }
          }
          setCheckInCounts(counts);
          setCheckInUsersByEvent(usersByEvent);
        }
      }

      // --- Friend locations ---
      if (locResult.error) {
        console.error('Failed to fetch friends locations:', locResult.error);
      } else {
        const friendMap = new Map(friends.map((f) => [f.user_id, f]));
        const locations: FriendLocation[] = (locResult.data ?? []).map(
          (row: { user_id: string; lat: number; lng: number; updated_at: string }) => {
            const friend = friendMap.get(row.user_id);
            return {
              user_id: row.user_id,
              lat: row.lat,
              lng: row.lng,
              updated_at: row.updated_at,
              display_name: friend?.display_name ?? undefined,
              x_handle: friend?.x_handle ?? undefined,
              avatar_url: friend?.avatar_url ?? undefined,
            };
          }
        );
        setFriendLocations(locations);
      }

      initialFetchDone.current = true;
    }

    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, friendIds]);

  // ---- 5-min location polling interval ----
  useEffect(() => {
    if (authLoading || !user || friends.length === 0) return;

    async function fetchLocations() {
      const { data, error } = await supabase.rpc('get_friends_locations');

      if (error) {
        console.error('Failed to fetch friends locations:', error);
        return;
      }

      const friendMap = new Map(friends.map((f) => [f.user_id, f]));
      const locations: FriendLocation[] = (data ?? []).map(
        (row: { user_id: string; lat: number; lng: number; updated_at: string }) => {
          const friend = friendMap.get(row.user_id);
          return {
            user_id: row.user_id,
            lat: row.lat,
            lng: row.lng,
            updated_at: row.updated_at,
            display_name: friend?.display_name ?? undefined,
            x_handle: friend?.x_handle ?? undefined,
            avatar_url: friend?.avatar_url ?? undefined,
          };
        }
      );
      setFriendLocations(locations);
    }

    const interval = setInterval(fetchLocations, 5 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, friendIds]);

  // ---- Friends' active check-ins (venue pins), every 2 min while visible ----
  useEffect(() => {
    if (authLoading || !user || friends.length === 0) {
      setFriendCheckIns([]);
      return;
    }

    let cancelled = false;
    let lastFetchAt = 0;
    const friendIdList = friends.map((f) => f.user_id);

    async function fetchCheckIns() {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchAt < 30_000) return;
      lastFetchAt = Date.now();

      const { data, error } = await supabase.rpc('get_friends_active_check_ins');
      if (cancelled) return;
      if (!error) {
        setFriendCheckIns((data ?? []) as FriendCheckIn[]);
        setFriendCheckInsFetchedAt(Date.now());
        return;
      }

      // Fallback while the RPC isn't deployed: read check_ins directly (RLS-scoped).
      if (error.code !== '42883' && error.code !== 'PGRST202') {
        console.error('Failed to fetch friends check-ins:', error);
      }
      const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: rows, error: fbError } = await supabase
        .from('check_ins')
        .select('user_id, event_id, created_at')
        .in('user_id', friendIdList)
        .is('checked_out_at', null)
        .gte('created_at', since);
      if (cancelled) return;
      if (fbError) {
        console.error('Failed to fetch friends check-ins (fallback):', fbError);
        return;
      }
      setFriendCheckIns((rows ?? []) as FriendCheckIn[]);
      setFriendCheckInsFetchedAt(Date.now());
    }

    fetchCheckIns();
    const interval = setInterval(fetchCheckIns, 2 * 60 * 1000);
    document.addEventListener('visibilitychange', fetchCheckIns);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', fetchCheckIns);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, friendIds]);

  // ---- Merge display names from friends array ----
  const friendItineraries: FriendItinerary[] = useMemo(() => {
    const friendMap = new Map(friends.map((f) => [f.user_id, f]));
    return rawItineraries.map((ri) => {
      const friend = friendMap.get(ri.userId);
      return {
        userId: ri.userId,
        displayName: friend ? getDisplayName(friend, ri.userId.slice(0, 8)) : ri.userId.slice(0, 8),
        avatarUrl: friend?.avatar_url,
        xHandle: friend?.x_handle,
        eventIds: new Set(ri.eventIds),
      };
    });
  }, [rawItineraries, friends]);

  return {
    friendItineraries,
    checkInCounts,
    checkInUsersByEvent,
    friendLocations,
    friendCheckIns,
    friendCheckInsFetchedAt,
  };
}
