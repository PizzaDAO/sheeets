'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export function useXVerification() {
  const { user } = useAuth();
  const [isXVerified, setIsXVerified] = useState(false);
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch verification status from profile
  useEffect(() => {
    async function checkVerification() {
      if (!user) {
        setIsXVerified(false);
        setXHandle(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('x_verified, x_handle, x_oauth_id')
        .eq('user_id', user!.id)
        .single();

      if (data) {
        setIsXVerified(data.x_verified ?? false);
        setXHandle(data.x_handle ?? null);
      }
      setLoading(false);
    }

    checkVerification();
  }, [user]);

  // After OAuth redirect, detect newly linked X identity and update profile
  useEffect(() => {
    if (!user || isXVerified) return;

    const twitterIdentity = user.identities?.find(
      (id) => id.provider === 'twitter'
    );

    if (twitterIdentity) {
      const handle = twitterIdentity.identity_data?.user_name;
      const avatarUrl = twitterIdentity.identity_data?.avatar_url;
      const oauthId = twitterIdentity.id;

      if (handle && oauthId) {
        // Update profile with verified X data
        supabase
          .from('profiles')
          .update({
            x_handle: handle,
            x_verified: true,
            x_oauth_id: oauthId,
            x_avatar_url: avatarUrl || null,
          })
          .eq('user_id', user.id)
          .then(() => {
            setIsXVerified(true);
            setXHandle(handle);
          });
      }
    }
  }, [user, isXVerified]);

  const linkX = useCallback(async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'twitter',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) console.error('Failed to link X:', error);
    // Browser will redirect to X OAuth
  }, []);

  const unlinkX = useCallback(async () => {
    if (!user) return;

    const twitterIdentity = user.identities?.find(
      (id) => id.provider === 'twitter'
    );

    if (twitterIdentity) {
      await supabase.auth.unlinkIdentity(twitterIdentity);
      await supabase
        .from('profiles')
        .update({
          x_verified: false,
          x_oauth_id: null,
          x_avatar_url: null,
        })
        .eq('user_id', user.id);

      setIsXVerified(false);
    }
  }, [user]);

  return { isXVerified, xHandle, loading, linkX, unlinkX };
}
