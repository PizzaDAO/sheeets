'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { trackFriendCodeRedeemed } from '@/lib/analytics';

export interface FriendCodeToast {
  message: string;
  type: 'success' | 'error';
}

interface UseFriendCodeOptions {
  openAuth: () => void;
  refreshFriends: () => Promise<void>;
}

/**
 * Reads ?fc={code} from the URL on mount, strips it, and sends a
 * friend request to the code owner. If the user is not logged in,
 * triggers the auth modal and retries after authentication.
 */
export function useFriendCode({ openAuth, refreshFriends }: UseFriendCodeOptions) {
  const { user, loading: authLoading } = useAuth();
  const [toast, setToast] = useState<FriendCodeToast | null>(null);
  const pendingCodeRef = useRef<string | null>(null);
  const processedRef = useRef(false);

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const redeemCode = useCallback(async (code: string) => {
    if (!user) return;

    // Look up the friend code to get the target user
    const { data: codeRow, error: lookupError } = await supabase
      .from('friend_codes')
      .select('user_id')
      .eq('code', code)
      .single();

    if (lookupError || !codeRow) {
      setToast({ message: 'Invalid friend code', type: 'error' });
      return;
    }

    const targetUserId = codeRow.user_id;

    // Check if it's the user's own code
    if (targetUserId === user.id) {
      setToast({ message: "That's your own friend code!", type: 'error' });
      return;
    }

    // Send the friend request via RPC
    const { data, error } = await supabase.rpc('send_friend_request', {
      receiver: targetUserId,
    });

    if (error) {
      // Parse common error messages from the RPC
      const msg = error.message.toLowerCase();
      if (msg.includes('already friends')) {
        // Fetch target name for a nicer message
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, x_handle')
          .eq('user_id', targetUserId)
          .single();
        const name = profile?.display_name || (profile?.x_handle ? `@${profile.x_handle}` : 'this person');
        setToast({ message: `Already friends with ${name}`, type: 'error' });
      } else if (msg.includes('pending')) {
        setToast({ message: 'Friend request already pending', type: 'error' });
      } else {
        setToast({ message: `Friend request failed: ${error.message}`, type: 'error' });
      }
      return;
    }

    // If data indicates already_friends or already_pending (some RPCs return status)
    if (typeof data === 'string') {
      if (data === 'already_friends') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, x_handle')
          .eq('user_id', targetUserId)
          .single();
        const name = profile?.display_name || (profile?.x_handle ? `@${profile.x_handle}` : 'this person');
        setToast({ message: `Already friends with ${name}`, type: 'error' });
        return;
      }
      if (data === 'already_pending') {
        setToast({ message: 'Friend request already pending', type: 'error' });
        return;
      }
    }

    trackFriendCodeRedeemed(code);
    refreshFriends();
    setToast({ message: 'Friend request sent!', type: 'success' });
  }, [user, refreshFriends]);

  // On mount: read ?fc= param, strip it from URL, and either redeem or queue for auth
  useEffect(() => {
    if (authLoading || processedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('fc');
    if (!code) return;

    processedRef.current = true;

    // Strip ?fc= from URL immediately
    params.delete('fc');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState(null, '', newUrl);

    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async: its setState calls all run after an await, not synchronously in the effect
      redeemCode(code);
    } else {
      // Store pending code and trigger auth
      pendingCodeRef.current = code;
      openAuth();
    }
  }, [authLoading, user, redeemCode, openAuth]);

  // After auth completes, redeem the pending code
  useEffect(() => {
    if (user && pendingCodeRef.current) {
      const code = pendingCodeRef.current;
      pendingCodeRef.current = null;
      redeemCode(code);
    }
  }, [user, redeemCode]);

  return { toast };
}
