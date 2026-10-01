'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export function useRsvp() {
  const { user } = useAuth();
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [activeRsvp, setActiveRsvp] = useState<{ eventId: string; lumaUrl: string; eventName: string } | null>(null);

  // Clear on sign-out (adjusted during render, not in an effect).
  const [prevUser, setPrevUser] = useState(user);
  if (user !== prevUser) {
    setPrevUser(user);
    if (!user) setConfirmedIds(new Set());
  }

  // Load user's RSVPs on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from('rsvps')
      .select('event_id')
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .then(({ data }) => {
        if (data) setConfirmedIds(new Set(data.map(r => r.event_id)));
      });
  }, [user]);

  const getRsvpStatus = useCallback(
    (eventId: string): 'idle' | 'confirmed' =>
      confirmedIds.has(eventId) ? 'confirmed' : 'idle',
    [confirmedIds]
  );

  const openRsvp = useCallback((eventId: string, lumaUrl: string, eventName: string) => {
    setActiveRsvp({ eventId, lumaUrl, eventName });
  }, []);

  const confirmRsvp = useCallback(async () => {
    if (!user || !activeRsvp) return;
    const { error } = await supabase.from('rsvps').insert({
      user_id: user.id,
      event_id: activeRsvp.eventId,
      status: 'confirmed',
      method: 'manual',
    });
    if (!error) {
      setConfirmedIds(prev => new Set(prev).add(activeRsvp.eventId));
    }
    setActiveRsvp(null);
  }, [user, activeRsvp]);

  const closeRsvp = useCallback(() => setActiveRsvp(null), []);

  return { getRsvpStatus, openRsvp, confirmRsvp, closeRsvp, activeRsvp };
}
