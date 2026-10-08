import type { ETHDenverEvent, FilterState } from './types';
import { getTabConfig } from './conferences';
import { parseTimeToMinutes } from './time-parse';
import { TAG_ALIASES } from './tags';

// Re-export so existing consumers of `parseTimeToMinutes` from filters.ts still work
export { parseTimeToMinutes } from './time-parse';

/** Get current time in conference timezone */
export function getConferenceNow(conference?: string): Date {
  const tz = getTabConfig(conference ?? '').timezone;
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
}

/** Build a Date range from an event's dateISO + time strings */
function eventToDateRange(event: ETHDenverEvent): { start: Date; end: Date } | null {
  if (!event.dateISO) return null;

  if (event.isAllDay) {
    return {
      start: new Date(`${event.dateISO}T00:00:00`),
      end: new Date(`${event.dateISO}T23:59:59`),
    };
  }

  const startMinutes = parseTimeToMinutes(event.startTime);
  if (startMinutes === null) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const startH = Math.floor(startMinutes / 60);
  const startM = startMinutes % 60;
  const start = new Date(`${event.dateISO}T${pad(startH)}:${pad(startM)}:00`);

  const endMinutes = parseTimeToMinutes(event.endTime);
  let end: Date;
  if (endMinutes !== null) {
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    end = new Date(`${event.dateISO}T${pad(endH)}:${pad(endM)}:00`);
    if (end <= start) end.setDate(end.getDate() + 1); // cross-midnight
  } else {
    end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // assume 2hr
  }

  return { start, end };
}

/** Check if an event passes the "Now" filter (happening now or starting within 60 minutes) */
export function passesNowFilter(event: ETHDenverEvent, now: Date): boolean {
  // Check if event date matches today or yesterday (for cross-midnight events)
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayISO = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;

  const isToday = event.dateISO === todayISO;
  const isYesterday = event.dateISO === yesterdayISO;
  if (!isToday && !isYesterday) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // For yesterday's events, only include if they cross midnight and end after now
  if (isYesterday) {
    const startMin = parseTimeToMinutes(event.startTime);
    const endMin = parseTimeToMinutes(event.endTime);
    if (startMin === null || endMin === null) return false;
    // Must be cross-midnight (end < start) and end time hasn't passed yet
    return endMin < startMin && endMin > nowMinutes;
  }

  // All-day events happening today always pass
  if (event.isAllDay) return true;
  const startMinutes = parseTimeToMinutes(event.startTime);

  // If we can't parse start time, include the event (benefit of the doubt)
  if (startMinutes === null) return true;

  const endMinutes = parseTimeToMinutes(event.endTime);

  // Event is currently happening: started and hasn't ended
  if (startMinutes <= nowMinutes) {
    // If no end time, assume it's still going for 2 hours after start
    if (endMinutes === null) {
      return nowMinutes <= startMinutes + 120;
    }
    // Cross-midnight: end time is before start time (e.g. 7pm-2am)
    // If we're on the start day, the event hasn't ended yet
    if (endMinutes < startMinutes) return true;
    // Same-day: end time is after now — still happening
    if (endMinutes >= nowMinutes) return true;
    return false;
  }

  // Event starts within the next 60 minutes
  if (startMinutes > nowMinutes && startMinutes <= nowMinutes + 60) {
    return true;
  }

  return false;
}

/** Check if an event overlaps a given day (midnight to midnight) */
function passesDateFilter(event: ETHDenverEvent, dayStart: Date, dayEnd: Date): boolean {
  const eventRange = eventToDateRange(event);
  if (!eventRange) return true; // benefit of the doubt
  return eventRange.start < dayEnd && eventRange.end > dayStart;
}

export function applyFilters(
  events: ETHDenverEvent[],
  filters: FilterState,
  itinerary?: Set<string>,
  nowTimestamp?: number,
  friendEventIds?: Set<string>,
  options?: { skipVibes?: boolean; orgEventIds?: Set<string>; eventIdToOrgs?: Map<string, string[]> },
): ETHDenverEvent[] {
  // Create the "now" Date once using conference timezone
  const now = nowTimestamp ? new Date(nowTimestamp) : getConferenceNow(filters.conference);

  const timeModeActive = filters.timeMode !== 'off';

  // Pre-compute filter bounds outside the loop
  const filterStart = !timeModeActive && filters.startDateTime ? new Date(filters.startDateTime) : null;
  const filterEnd = !timeModeActive && filters.endDateTime ? new Date(filters.endDateTime) : null;

  // Pre-compute day boundaries for today/tomorrow/week modes
  let dayStart: Date | null = null;
  let dayEnd: Date | null = null;
  if (filters.timeMode === 'today') {
    dayStart = now; // exclude events that already ended
    dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  } else if (filters.timeMode === 'tomorrow') {
    dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 0, 0, 0);
  }

  return events.filter((event) => {
    // Conference filter
    if (filters.conference && event.conference !== filters.conference) {
      return false;
    }

    // Time mode overrides datetime filters
    if (filters.timeMode === 'now') {
      if (!passesNowFilter(event, now)) return false;
    } else if (dayStart && dayEnd) {
      if (!passesDateFilter(event, dayStart, dayEnd)) return false;
    } else if (filterStart && filterEnd) {
      const eventRange = eventToDateRange(event);
      if (eventRange) {
        // Interval overlap: event overlaps filter range if event.start < filterEnd AND event.end > filterStart
        if (eventRange.start >= filterEnd || eventRange.end <= filterStart) {
          return false;
        }
      }
    }

    // Tag filter — skip when computing base for tag counts
    // Expand event tags with aliases (e.g. "Dinner" also counts as "Food")
    if (!options?.skipVibes && filters.vibes.length > 0) {
      const expandedTags = new Set(event.tags);
      for (const t of event.tags) {
        const alias = TAG_ALIASES[t];
        if (alias) expandedTags.add(alias);
      }
      const match = filters.tagMatchAll
        ? filters.vibes.every(t => expandedTags.has(t))   // AND: event has all selected tags
        : filters.vibes.some(t => expandedTags.has(t));   // OR: event has any selected tag
      if (!match) {
        return false;
      }
    }

    // Itinerary
    if (filters.itineraryOnly && itinerary && !itinerary.has(event.id))
      return false;

    // Friends filter
    if (filters.selectedFriends.length > 0 && friendEventIds && !friendEventIds.has(event.id))
      return false;

    // Org filter
    if (filters.selectedOrgs.length > 0 && options?.orgEventIds) {
      if (!options.orgEventIds.has(event.id)) return false;
    }

    // Search
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const searchable = [
        event.name,
        event.organizer,
        event.address,
        event.note,
        event.conference,
        ...event.tags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!searchable.includes(q)) {
        // Check org names for this event
        const orgs = options?.eventIdToOrgs?.get(event.id);
        if (!orgs || !orgs.some(o => o.toLowerCase().includes(q))) {
          return false;
        }
      }
    }

    return true;
  });
}

/** Count how many events each tag appears in from a pre-filtered list */
export function computeTagCounts(events: ETHDenverEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    for (const tag of event.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
      // Also count aliases (e.g. "Dinner" events count toward "Food")
      const alias = TAG_ALIASES[tag];
      if (alias && !event.tags.includes(alias)) {
        counts.set(alias, (counts.get(alias) ?? 0) + 1);
      }
    }
  }
  return counts;
}
