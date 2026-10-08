import { describe, it, expect } from 'vitest';
import { deriveVenuePins, excludeFriendsAtVenues, venuePinLabel, type FriendCheckIn } from '../venue-pins';
import type { ETHDenverEvent, Friend, FriendLocation } from '../types';

const NOW = Date.parse('2026-10-01T18:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function event(id: string, name: string, lat?: number, lng?: number): ETHDenverEvent {
  return { id, name, lat, lng } as ETHDenverEvent;
}
function friend(user_id: string, display_name: string): Friend {
  return { user_id, display_name, email: null, x_handle: null, rsvp_name: null, avatar_url: null };
}

const events = new Map([
  ['brunch', event('brunch', 'Founders Brunch', 40.71, -74.0)],
  ['party', event('party', 'Night Party', 40.72, -74.01)],
  ['nogeo', event('nogeo', 'TBA Venue')],
]);
const friends = new Map([
  ['alex', friend('alex', 'Alex Kim')],
  ['bo', friend('bo', 'Bo')],
  ['cy', friend('cy', 'Cy')],
]);

describe('deriveVenuePins', () => {
  it('pins a checked-in friend at the event venue', () => {
    const pins = deriveVenuePins(
      [{ user_id: 'alex', event_id: 'brunch', created_at: minsAgo(20) }],
      events, friends, { nowMs: NOW }
    );
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ eventId: 'brunch', eventName: 'Founders Brunch', lat: 40.71, lng: -74.0 });
    expect(pins[0].friends.map((f) => f.user_id)).toEqual(['alex']);
    expect(pins[0].friends[0]).toMatchObject({ lat: 40.71, lng: -74.0, display_name: 'Alex Kim' });
  });

  it('groups multiple friends at one venue, most recent first', () => {
    const pins = deriveVenuePins(
      [
        { user_id: 'alex', event_id: 'brunch', created_at: minsAgo(60) },
        { user_id: 'bo', event_id: 'brunch', created_at: minsAgo(5) },
        { user_id: 'cy', event_id: 'party', created_at: minsAgo(30) },
      ],
      events, friends, { nowMs: NOW }
    );
    expect(pins.map((p) => p.eventId)).toEqual(['brunch', 'party']);
    expect(pins[0].friends.map((f) => f.user_id)).toEqual(['bo', 'alex']);
  });

  it('uses only the latest check-in per friend', () => {
    const pins = deriveVenuePins(
      [
        { user_id: 'alex', event_id: 'brunch', created_at: minsAgo(120) },
        { user_id: 'alex', event_id: 'party', created_at: minsAgo(10) },
      ],
      events, friends, { nowMs: NOW }
    );
    expect(pins).toHaveLength(1);
    expect(pins[0].eventId).toBe('party');
  });

  it('drops stale check-ins unless the event is live', () => {
    const checkIns: FriendCheckIn[] = [{ user_id: 'alex', event_id: 'brunch', created_at: minsAgo(4 * 60) }];
    expect(deriveVenuePins(checkIns, events, friends, { nowMs: NOW })).toEqual([]);
    expect(
      deriveVenuePins(checkIns, events, friends, { nowMs: NOW, isLive: (id) => id === 'brunch' })
    ).toHaveLength(1);
  });

  it('skips non-friends, unknown events, and events without coordinates', () => {
    const pins = deriveVenuePins(
      [
        { user_id: 'stranger', event_id: 'brunch', created_at: minsAgo(5) },
        { user_id: 'alex', event_id: 'missing', created_at: minsAgo(5) },
        { user_id: 'bo', event_id: 'nogeo', created_at: minsAgo(5) },
      ],
      events, friends, { nowMs: NOW }
    );
    expect(pins).toEqual([]);
  });
});

describe('excludeFriendsAtVenues', () => {
  it('prefers venue pins over raw GPS', () => {
    const gps: FriendLocation[] = [
      { user_id: 'alex', lat: 1, lng: 1, updated_at: minsAgo(1) },
      { user_id: 'bo', lat: 2, lng: 2, updated_at: minsAgo(1) },
    ];
    const pins = deriveVenuePins(
      [{ user_id: 'alex', event_id: 'brunch', created_at: minsAgo(5) }],
      events, friends, { nowMs: NOW }
    );
    expect(excludeFriendsAtVenues(gps, pins).map((l) => l.user_id)).toEqual(['bo']);
  });
});

describe('venuePinLabel', () => {
  it('formats single and multiple friends', () => {
    expect(venuePinLabel('Alex', 1, 'Founders Brunch')).toBe('Alex @ Founders Brunch');
    expect(venuePinLabel('Alex', 3, 'Founders Brunch')).toBe('Alex +2 @ Founders Brunch');
  });
});
