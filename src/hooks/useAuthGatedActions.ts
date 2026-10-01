'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { trackItinerary, trackAuthPrompt } from '@/lib/analytics';
import type { ReactionEmoji, FilterState } from '@/lib/types';

interface UseAuthGatedActionsOptions {
  itinerary: Set<string>;
  toggleItinerary: (eventId: string) => void;
  itineraryReady: boolean;
  toggleReaction: (eventId: string, emoji: ReactionEmoji) => void;
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  itineraryOnly: boolean;
}

/**
 * Wraps itinerary toggle and reaction toggle with auth-gate logic.
 * Shows an auth modal when the user is not signed in; after sign-in
 * completes, the pending star action is automatically executed.
 */
export function useAuthGatedActions({
  itinerary,
  toggleItinerary,
  itineraryReady,
  toggleReaction,
  setFilter,
  itineraryOnly,
}: UseAuthGatedActionsOptions) {
  const { user } = useAuth();

  const [showAuthForStar, setShowAuthForStar] = useState(false);
  const pendingStarRef = useRef<string | null>(null);

  const handleItineraryToggle = useCallback(
    (eventId: string) => {
      if (user) {
        const action = itinerary.has(eventId) ? 'remove' : 'add';
        trackItinerary(eventId, action);
        toggleItinerary(eventId);
      } else {
        trackAuthPrompt('star');
        pendingStarRef.current = eventId;
        setShowAuthForStar(true);
      }
    },
    [user, toggleItinerary, itinerary]
  );

  const handleToggleReaction = useCallback(
    (eventId: string, emoji: ReactionEmoji) => {
      if (user) {
        toggleReaction(eventId, emoji);
      } else {
        trackAuthPrompt('reaction');
        setShowAuthForStar(true);
      }
    },
    [user, toggleReaction]
  );

  // Complete pending star after successful login + sync
  useEffect(() => {
    if (user && itineraryReady && pendingStarRef.current) {
      toggleItinerary(pendingStarRef.current);
      pendingStarRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- completes a deferred action once external auth + itinerary sync finish (pending action lives in a ref)
      setShowAuthForStar(false);
    }
  }, [user, itineraryReady, toggleItinerary]);

  // Turn off itinerary filter if user signs out or auth is dismissed
  useEffect(() => {
    if (!user && itineraryOnly) {
      setFilter('itineraryOnly', false);
    }
  }, [user, itineraryOnly, setFilter]);

  const dismissAuth = useCallback(() => {
    pendingStarRef.current = null;
    setShowAuthForStar(false);
  }, []);

  return {
    showAuthForStar,
    handleItineraryToggle,
    handleToggleReaction,
    dismissAuth,
  };
}
