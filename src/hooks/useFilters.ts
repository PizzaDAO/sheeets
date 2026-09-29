'use client';

import { useState, useCallback, useMemo } from 'react';
import type { FilterState } from '@/lib/types';
import { DEFAULT_TAB, getTabConfig } from '@/lib/constants';
import type { TabConfig } from '@/lib/conferences';

function getDateTimeRangeForConference(conference: string, tabs?: TabConfig[]): { startDateTime: string; endDateTime: string } {
  const tab = getTabConfig(conference, tabs);
  const dates = tab.dates;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: tab.timezone }));
  const pad = (n: number) => String(n).padStart(2, '0');
  const mins = now.getMinutes() < 30 ? 0 : 30;
  const nowISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(mins)}`;

  const firstEventStart = `${dates[0]}T00:00`;
  const lastEventEnd = `${dates[dates.length - 1]}T23:30`;

  // If now is before or after the event range, show all events
  if (nowISO > lastEventEnd || nowISO < firstEventStart) {
    return { startDateTime: firstEventStart, endDateTime: lastEventEnd };
  }

  return { startDateTime: nowISO, endDateTime: lastEventEnd };
}

function buildDefaultFilters(conference: string, tabs?: TabConfig[]): FilterState {
  const range = getDateTimeRangeForConference(conference, tabs);
  return {
    conference,
    startDateTime: range.startDateTime,
    endDateTime: range.endDateTime,
    vibes: [],
    tagMatchAll: false,
    selectedFriends: [],
    itineraryOnly: false,
    searchQuery: '',
    timeMode: 'off',
    selectedOrgs: [],
  };
}

const defaultFilters = buildDefaultFilters(DEFAULT_TAB.name);

export function useFilters(initialConference?: string, conferenceTabs?: TabConfig[]) {
  const initialState = useMemo(
    () => initialConference ? buildDefaultFilters(initialConference, conferenceTabs) : defaultFilters,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [filters, setFilters] = useState<FilterState>(initialState);

  const setFilter = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const setConference = useCallback((conf: string) => {
    const range = getDateTimeRangeForConference(conf, conferenceTabs);
    setFilters((prev) => ({ ...prev, conference: conf, startDateTime: range.startDateTime, endDateTime: range.endDateTime }));
  }, [conferenceTabs]);

  const setDateTimeRange = useCallback((start: string, end: string) => {
    setFilters((prev) => ({ ...prev, startDateTime: start, endDateTime: end, timeMode: 'off' }));
  }, []);

  const toggleVibe = useCallback((vibe: string) => {
    setFilters((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(vibe)
        ? prev.vibes.filter((v) => v !== vibe)
        : [...prev.vibes, vibe],
    }));
  }, []);

  const toggleFriend = useCallback((friendId: string) => {
    setFilters((prev) => ({
      ...prev,
      selectedFriends: prev.selectedFriends.includes(friendId)
        ? prev.selectedFriends.filter((f) => f !== friendId)
        : [...prev.selectedFriends, friendId],
    }));
  }, []);

  const toggleBool = useCallback(
    (key: 'itineraryOnly') => {
      setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    []
  );

  const cycleTimeMode = useCallback(() => {
    setFilters((prev) => {
      const order: FilterState['timeMode'][] = ['off', 'now', 'today', 'tomorrow'];
      const idx = order.indexOf(prev.timeMode);
      const next = order[(idx + 1) % order.length];
      return { ...prev, timeMode: next };
    });
  }, []);

  const toggleTagMatchAll = useCallback(() => {
    setFilters((prev) => ({ ...prev, tagMatchAll: !prev.tagMatchAll }));
  }, []);

  const toggleOrg = useCallback((orgName: string) => {
    setFilters((prev) => ({
      ...prev,
      selectedOrgs: prev.selectedOrgs.includes(orgName)
        ? prev.selectedOrgs.filter((o) => o !== orgName)
        : [...prev.selectedOrgs, orgName],
    }));
  }, []);

  const clearFilters = useCallback(() => setFilters(buildDefaultFilters(filters.conference, conferenceTabs)), [filters.conference, conferenceTabs]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    // Compare dates against the *current* conference's defaults, not the initial conference
    const currentDefaults = getDateTimeRangeForConference(filters.conference, conferenceTabs);
    if (filters.startDateTime !== currentDefaults.startDateTime || filters.endDateTime !== currentDefaults.endDateTime) count++;
    count += filters.vibes.length;
    if (filters.selectedFriends.length > 0) count++;
    if (filters.selectedOrgs.length > 0) count++;
    return count;
  }, [filters, conferenceTabs]);

  return {
    filters,
    setFilter,
    setConference,
    setDateTimeRange,
    toggleVibe,
    toggleFriend,
    toggleBool,
    cycleTimeMode,
    toggleTagMatchAll,
    clearFilters,
    activeFilterCount,
    toggleOrg,
  };
}
