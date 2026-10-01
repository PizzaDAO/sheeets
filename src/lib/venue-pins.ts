import type { ETHDenverEvent, Friend, FriendLocation } from './types';

/** A friend's active (not checked-out) check-in, as returned by get_friends_active_check_ins(). */
export interface FriendCheckIn {
  user_id: string;
  event_id: string;
  created_at: string;
}

/** One map pin at an event's venue, holding every friend checked in there. */
export interface VenuePin {
  eventId: string;
  eventName: string;
  lat: number;
  lng: number;
  /** Friends at this venue, most recent check-in first. */
  friends: FriendLocation[];
}

export interface DeriveVenuePinsOptions {
  /** Current time (ms). */
  nowMs: number;
  /** Whether the event is happening right now. Live events keep pins regardless of check-in age. */
  isLive?: (eventId: string) => boolean;
  /** For events that aren't live (or unknown timing), max check-in age to still show a pin. Default 3h. */
  maxAgeMs?: number;
}

export const VENUE_PIN_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/**
 * Turn friends' check-ins into venue pins.
 * - Only the most recent check-in per friend is used (a friend is in one place).
 * - The event must be known and geocoded.
 * - Check-in must be recent: the event is live, or the check-in is within maxAgeMs.
 * - Friends at the same event are grouped into a single pin.
 */
export function deriveVenuePins(
  checkIns: FriendCheckIn[],
  eventsById: Map<string, ETHDenverEvent>,
  friendsById: Map<string, Friend>,
  { nowMs, isLive, maxAgeMs = VENUE_PIN_MAX_AGE_MS }: DeriveVenuePinsOptions,
): VenuePin[] {
  // Latest qualifying check-in per friend
  const latestByFriend = new Map<string, { checkIn: FriendCheckIn; ts: number; event: ETHDenverEvent }>();
  for (const ci of checkIns) {
    const friend = friendsById.get(ci.user_id);
    if (!friend) continue;
    const event = eventsById.get(ci.event_id);
    if (!event || event.lat == null || event.lng == null) continue;
    const ts = new Date(ci.created_at).getTime();
    if (Number.isNaN(ts) || ts > nowMs + 5 * 60 * 1000) continue;
    const live = isLive?.(ci.event_id) ?? false;
    if (!live && nowMs - ts > maxAgeMs) continue;
    const prev = latestByFriend.get(ci.user_id);
    if (!prev || ts > prev.ts) latestByFriend.set(ci.user_id, { checkIn: ci, ts, event });
  }

  // Iterating newest-first means Map insertion order is also newest-first.
  const pinsByEvent = new Map<string, VenuePin>();
  const sorted = [...latestByFriend.values()].sort((a, b) => b.ts - a.ts);
  for (const { checkIn, event } of sorted) {
    const friend = friendsById.get(checkIn.user_id)!;
    let pin = pinsByEvent.get(event.id);
    if (!pin) {
      pin = {
        eventId: event.id,
        eventName: event.name,
        lat: event.lat!,
        lng: event.lng!,
        friends: [],
      };
      pinsByEvent.set(event.id, pin);
    }
    pin.friends.push({
      user_id: friend.user_id,
      lat: event.lat!,
      lng: event.lng!,
      updated_at: checkIn.created_at,
      display_name: friend.display_name ?? undefined,
      x_handle: friend.x_handle ?? undefined,
      avatar_url: friend.avatar_url ?? undefined,
    });
  }

  return [...pinsByEvent.values()];
}

/** Raw GPS locations minus friends already shown at a venue (venue pins take precedence). */
export function excludeFriendsAtVenues(
  locations: FriendLocation[],
  pins: VenuePin[],
): FriendLocation[] {
  if (pins.length === 0) return locations;
  const atVenue = new Set<string>();
  for (const p of pins) for (const f of p.friends) atVenue.add(f.user_id);
  return locations.filter((l) => !atVenue.has(l.user_id));
}

/** "Alex @ Founders Brunch" / "Alex +2 @ Founders Brunch". */
export function venuePinLabel(firstName: string, count: number, eventName: string): string {
  const who = count > 1 ? `${firstName} +${count - 1}` : firstName;
  return `${who} @ ${eventName}`;
}
