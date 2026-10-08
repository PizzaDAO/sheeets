'use client';

import { useState, useEffect, useMemo } from 'react';
import type { ETHDenverEvent, FilterState } from '@/lib/types';
import { applyFilters, getConferenceNow } from '@/lib/filters';

interface UseNowModeOptions {
  events: ETHDenverEvent[];
  filters: FilterState;
  itinerary: Set<string>;
  selectedFriendEventIds?: Set<string>;
  filterOptions?: { skipVibes?: boolean; orgEventIds?: Set<string>; eventIdToOrgs?: Map<string, string[]> };
}

/**
 * Manages the time-mode auto-refresh tick and computes filtered events.
 * Bumps every 5 minutes while any time mode is active so the event list updates.
 */
export function useNowMode({
  events,
  filters,
  itinerary,
  selectedFriendEventIds,
  filterOptions,
}: UseNowModeOptions) {
  const [nowTick, setNowTick] = useState(0);

  const timeModeActive = filters.timeMode !== 'off';

  useEffect(() => {
    if (!timeModeActive) return;
    const interval = setInterval(() => {
      setNowTick((t) => t + 1);
    }, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [timeModeActive]);

  const filteredEvents = useMemo(
    () =>
      applyFilters(
        events,
        filters,
        itinerary,
        timeModeActive ? getConferenceNow(filters.conference).getTime() : undefined,
        selectedFriendEventIds,
        filterOptions
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, filters, itinerary, nowTick, selectedFriendEventIds, filterOptions]
  );

  return { filteredEvents };
}
