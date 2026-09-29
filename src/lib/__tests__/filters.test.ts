import { describe, it, expect } from 'vitest';
import { applyFilters, passesNowFilter } from '../filters';
import type { FilterState } from '../types';
import { sampleEvents } from './fixtures/sample-events';

/** Helper: create a FilterState with defaults, overriding specified fields */
function makeFilters(overrides: Partial<FilterState> = {}): FilterState {
  return {
    conference: '',
    startDateTime: '',
    endDateTime: '',
    vibes: [],
    tagMatchAll: false,
    selectedFriends: [],
    itineraryOnly: false,
    searchQuery: '',
    timeMode: 'off',
    selectedOrgs: [],
    ...overrides,
  };
}

describe('applyFilters', () => {
  describe('empty filters', () => {
    it('returns all events when no filters are applied', () => {
      const result = applyFilters(sampleEvents, makeFilters());
      expect(result.length).toBe(sampleEvents.length);
    });
  });

  describe('conference filter', () => {
    it('filters events by conference name', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ conference: 'PBW 2026' }),
      );
      expect(result.every((e) => e.conference === 'PBW 2026')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns only Bitcoin Vegas events', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ conference: 'Bitcoin Vegas' }),
      );
      expect(result.every((e) => e.conference === 'Bitcoin Vegas')).toBe(true);
    });

    it('returns empty array for non-existent conference', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ conference: 'Nonexistent 2026' }),
      );
      expect(result.length).toBe(0);
    });
  });

  describe('date/time range filter', () => {
    it('filters events within a date range', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({
          startDateTime: '2026-04-11T00:00',
          endDateTime: '2026-04-12T23:59',
        }),
      );
      // Should include Apr 11 and Apr 12 events
      expect(result.every((e) => e.dateISO >= '2026-04-11' && e.dateISO <= '2026-04-12')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('excludes events outside the date range', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({
          startDateTime: '2026-05-03T00:00',
          endDateTime: '2026-05-07T23:59',
        }),
      );
      // Should only include Consensus Miami events (May 3-7)
      expect(result.every((e) => e.conference === 'Consensus Miami')).toBe(true);
    });

    it('includes all-day events that overlap with the filter range', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({
          startDateTime: '2026-04-12T10:00',
          endDateTime: '2026-04-12T14:00',
        }),
      );
      // The hackathon (all-day on Apr 12) should be included
      const hackathon = result.find((e) => e.name === 'PBW Hackathon Day 1');
      expect(hackathon).toBeDefined();
    });

    it('includes events that partially overlap with filter range', () => {
      // Filter starts at 4pm but the keynote (9am-5pm) overlaps
      const result = applyFilters(
        sampleEvents,
        makeFilters({
          startDateTime: '2026-04-11T16:00',
          endDateTime: '2026-04-11T23:59',
        }),
      );
      const keynote = result.find((e) => e.name === 'PBW Opening Keynote');
      expect(keynote).toBeDefined();
    });
  });

  describe('cross-midnight events', () => {
    it('handles events that cross midnight (end < start)', () => {
      // The Bitcoin Vegas After Party runs 9pm-2am
      // A filter covering 11pm-3am should include it
      const result = applyFilters(
        sampleEvents,
        makeFilters({
          startDateTime: '2026-04-26T23:00',
          endDateTime: '2026-04-27T03:00',
        }),
      );
      const party = result.find((e) => e.name === 'Bitcoin Vegas After Party');
      expect(party).toBeDefined();
    });
  });

  describe('tag filter (Any/All)', () => {
    it('filters by a single tag', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ vibes: ['DeFi'] }),
      );
      expect(result.every((e) => e.tags.includes('DeFi'))).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('filters by multiple tags with AND logic', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ vibes: ['Conference', 'ETH'], tagMatchAll: true }),
      );
      expect(result.every((e) => e.tags.includes('Conference') && e.tags.includes('ETH'))).toBe(true);
    });

    it('returns empty when no event has all required tags', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ vibes: ['DeFi', 'Hackathon'], tagMatchAll: true }),
      );
      expect(result.length).toBe(0);
    });

    it('defaults to OR logic (any selected tag matches)', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ vibes: ['DeFi', 'Hackathon'] }),
      );
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((e) => e.tags.includes('DeFi') || e.tags.includes('Hackathon'))).toBe(true);
    });

    it('empty vibes array returns all events', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ vibes: [] }),
      );
      expect(result.length).toBe(sampleEvents.length);
    });
  });

  describe('search filter', () => {
    it('matches event name (case-insensitive)', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ searchQuery: 'keynote' }),
      );
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((e) => e.name.toLowerCase().includes('keynote'))).toBe(true);
    });

    it('matches organizer', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ searchQuery: 'Solana Foundation' }),
      );
      expect(result.length).toBe(1);
      expect(result[0].organizer).toBe('Solana Foundation');
    });

    it('matches address', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ searchQuery: 'wynwood' }),
      );
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('NFT Gallery Opening');
    });

    it('matches note', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ searchQuery: 'RSVP required' }),
      );
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Solana Builders Brunch');
    });

    it('matches tags', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ searchQuery: 'NFTs' }),
      );
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((e) => e.tags.includes('NFTs'))).toBe(true);
    });

    it('is case-insensitive', () => {
      const upper = applyFilters(sampleEvents, makeFilters({ searchQuery: 'YOGA' }));
      const lower = applyFilters(sampleEvents, makeFilters({ searchQuery: 'yoga' }));
      expect(upper.length).toBe(lower.length);
      expect(upper.length).toBeGreaterThan(0);
    });

    it('returns all events for empty search query', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ searchQuery: '' }),
      );
      expect(result.length).toBe(sampleEvents.length);
    });
  });

  describe('itinerary filter', () => {
    it('returns only starred events when itineraryOnly is true', () => {
      const itinerary = new Set(['evt-abc123', 'evt-pqr678']);
      const result = applyFilters(
        sampleEvents,
        makeFilters({ itineraryOnly: true }),
        itinerary,
      );
      expect(result.length).toBe(2);
      expect(result.every((e) => itinerary.has(e.id))).toBe(true);
    });

    it('returns all events when itineraryOnly is false', () => {
      const itinerary = new Set(['evt-abc123']);
      const result = applyFilters(
        sampleEvents,
        makeFilters({ itineraryOnly: false }),
        itinerary,
      );
      expect(result.length).toBe(sampleEvents.length);
    });

    it('returns empty when itinerary is empty and itineraryOnly is true', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ itineraryOnly: true }),
        new Set<string>(),
      );
      expect(result.length).toBe(0);
    });
  });

  describe('friends filter', () => {
    it('filters to friend events when selectedFriends is non-empty', () => {
      const friendEventIds = new Set(['evt-abc123', 'evt-def456']);
      const result = applyFilters(
        sampleEvents,
        makeFilters({ selectedFriends: ['friend-1'] }),
        undefined,
        undefined,
        friendEventIds,
      );
      expect(result.length).toBe(2);
      expect(result.every((e) => friendEventIds.has(e.id))).toBe(true);
    });

    it('returns all events when selectedFriends is empty', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({ selectedFriends: [] }),
      );
      expect(result.length).toBe(sampleEvents.length);
    });
  });

  describe('combined filters', () => {
    it('combines conference + tag filters', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({
          conference: 'PBW 2026',
          vibes: ['Conference'],
        }),
      );
      expect(result.every((e) => e.conference === 'PBW 2026' && e.tags.includes('Conference'))).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('combines conference + search filters', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({
          conference: 'Consensus Miami',
          searchQuery: 'yoga',
        }),
      );
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Consensus Morning Yoga');
    });

    it('combines conference + date + tag filters', () => {
      const result = applyFilters(
        sampleEvents,
        makeFilters({
          conference: 'PBW 2026',
          startDateTime: '2026-04-11T00:00',
          endDateTime: '2026-04-11T23:59',
          vibes: ['Conference'],
        }),
      );
      // Only PBW Conference events on Apr 11
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((e) =>
        e.conference === 'PBW 2026' &&
        e.dateISO === '2026-04-11' &&
        e.tags.includes('Conference'),
      )).toBe(true);
    });
  });
});

describe('passesNowFilter', () => {
  // Test at 2:30pm on April 11, 2026
  const now = new Date('2026-04-11T14:30:00');

  it('passes for event currently happening', () => {
    const event = sampleEvents.find((e) => e.name === 'PBW Opening Keynote')!;
    // 9am-5pm, now is 2:30pm — currently happening
    expect(passesNowFilter(event, now)).toBe(true);
  });

  it('passes for all-day event on same day', () => {
    // Create an all-day event for today
    const allDayEvent = {
      ...sampleEvents.find((e) => e.isAllDay)!,
      dateISO: '2026-04-11',
    };
    expect(passesNowFilter(allDayEvent, now)).toBe(true);
  });

  it('fails for event that already ended today', () => {
    // Simulate an event that ended at 1pm
    const endedEvent = {
      ...sampleEvents[0],
      dateISO: '2026-04-11',
      startTime: '10:00a',
      endTime: '1:00p',
      isAllDay: false,
    };
    expect(passesNowFilter(endedEvent, now)).toBe(false);
  });

  it('passes for event starting within 60 minutes', () => {
    // Event starts at 3pm, now is 2:30pm
    const soonEvent = {
      ...sampleEvents[0],
      dateISO: '2026-04-11',
      startTime: '3:00p',
      endTime: '5:00p',
      isAllDay: false,
    };
    expect(passesNowFilter(soonEvent, now)).toBe(true);
  });

  it('fails for event starting more than 60 minutes from now', () => {
    // Event starts at 5pm, now is 2:30pm
    const laterEvent = {
      ...sampleEvents[0],
      dateISO: '2026-04-11',
      startTime: '5:00p',
      endTime: '7:00p',
      isAllDay: false,
    };
    expect(passesNowFilter(laterEvent, now)).toBe(false);
  });

  it('fails for event on a different day', () => {
    const event = sampleEvents.find((e) => e.dateISO === '2026-04-12')!;
    expect(passesNowFilter(event, now)).toBe(false);
  });

  it('passes for cross-midnight event still happening after midnight', () => {
    // Test at 1am on April 27, the party (9pm-2am on Apr 26) should still pass
    const afterMidnight = new Date('2026-04-27T01:00:00');
    const party = sampleEvents.find((e) => e.name === 'Bitcoin Vegas After Party')!;
    expect(passesNowFilter(party, afterMidnight)).toBe(true);
  });

  it('fails for cross-midnight event after its end time', () => {
    // Test at 3am on April 27, the party (9pm-2am on Apr 26) has ended
    const lateNight = new Date('2026-04-27T03:00:00');
    const party = sampleEvents.find((e) => e.name === 'Bitcoin Vegas After Party')!;
    expect(passesNowFilter(party, lateNight)).toBe(false);
  });

  it('passes for event with unparseable start time (benefit of the doubt)', () => {
    const weirdEvent = {
      ...sampleEvents[0],
      dateISO: '2026-04-11',
      startTime: 'TBD',
      isAllDay: false,
    };
    expect(passesNowFilter(weirdEvent, now)).toBe(true);
  });
});
