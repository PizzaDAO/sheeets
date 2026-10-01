'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { POI, POICategory } from '@/lib/types';
import { MAX_POIS } from '@/lib/constants';

export function usePOIs() {
  const { user } = useAuth();
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());

  // Reset when the user changes (adjusted during render, not in an effect).
  const [prevUser, setPrevUser] = useState<typeof user | undefined>(undefined);
  if (user !== prevUser) {
    setPrevUser(user);
    if (!user) {
      setPois([]);
      setOwnerNames(new Map());
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  // Fetch on mount when authenticated
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('pois')
        .select('*')
        .order('created_at', { ascending: false });

      const poiList = data ?? [];
      setPois(poiList);

      // Resolve friend display names for POIs not owned by current user
      const friendUserIds = [...new Set(poiList.filter(p => p.user_id !== user.id).map(p => p.user_id))];
      if (friendUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', friendUserIds);
        setOwnerNames(new Map((profiles ?? []).map(p => [p.user_id, p.display_name ?? 'Friend'])));
      } else {
        setOwnerNames(new Map());
      }

      setLoading(false);
    })();
  }, [user]);

  const addPOI = useCallback(
    async (poi: {
      name: string;
      lat: number;
      lng: number;
      address?: string | null;
      category: POICategory;
      note?: string | null;
      conference?: string | null;
    }) => {
      if (!user || pois.filter(p => p.user_id === user.id).length >= MAX_POIS) return null;
      const { data, error } = await supabase
        .from('pois')
        .insert({ ...poi, user_id: user.id, is_public: false })
        .select()
        .single();
      if (error || !data) return null;
      setPois((prev) => [data, ...prev]);
      return data as POI;
    },
    [user, pois]
  );

  const removePOI = useCallback(
    async (id: string) => {
      if (!user) return;
      await supabase.from('pois').delete().eq('id', id).eq('user_id', user.id);
      setPois((prev) => prev.filter((p) => p.id !== id));
    },
    [user]
  );

  const updatePOI = useCallback(
    async (id: string, updates: Partial<Pick<POI, 'name' | 'category' | 'note' | 'is_public'>>) => {
      if (!user) return;
      const { data } = await supabase
        .from('pois')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();
      if (data) setPois((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    },
    [user]
  );

  return { pois, loading, addPOI, removePOI, updatePOI, ownerNames };
}
