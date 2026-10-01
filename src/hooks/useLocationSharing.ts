'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

/** How often to refresh the shared location while the tab is visible. */
const SHARE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Opt-in live location sharing. Only when `enabled` (profiles.share_live_location)
 * does this upsert the signed-in user's position to user_locations — on enable,
 * then every 5 min while the tab is visible. When disabled it never touches
 * geolocation; deleting the stored row on opt-out is handled by
 * useProfile().updateLocationSettings (and a DB trigger).
 */
export function useLocationSharing(enabled: boolean) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (authLoading || !userId || !enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    let cancelled = false;
    let lastSentAt = 0;

    const share = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSentAt < SHARE_INTERVAL_MS - 5000) return;
      lastSentAt = Date.now();
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          supabase
            .from('user_locations')
            .upsert(
              {
                user_id: userId,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id' }
            )
            .then(({ error }) => {
              if (error) console.error('Failed to upsert location:', error);
            });
        },
        (err) => {
          console.warn('Geolocation unavailable:', err.message);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    };

    share();
    const interval = setInterval(share, SHARE_INTERVAL_MS);
    document.addEventListener('visibilitychange', share);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', share);
    };
  }, [userId, authLoading, enabled]);
}
