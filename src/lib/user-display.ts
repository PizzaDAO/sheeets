interface DisplayNameSource {
  display_name?: string | null;
  x_handle?: string | null;
  rsvp_name?: string | null;
  avatar_url?: string | null;
}

/**
 * Get a display name from a user/friend profile, with fallback chain:
 * display_name -> @x_handle -> rsvp_name -> fallback
 */
export function getDisplayName(
  source: DisplayNameSource,
  fallback = 'Anonymous'
): string {
  return (
    source.display_name ||
    (source.x_handle ? `@${source.x_handle}` : null) ||
    source.rsvp_name ||
    fallback
  );
}

/**
 * Get the first character initial for an avatar, uppercase.
 * Falls back through display_name -> x_handle -> rsvp_name -> '?'
 */
export function getDisplayInitial(source: DisplayNameSource): string {
  const raw = source.display_name || source.x_handle || source.rsvp_name || '?';
  return raw[0]?.toUpperCase() ?? '?';
}

interface FriendInfo {
  displayName: string;
}

/**
 * Format a list of friends into a human-readable string:
 * 1 friend: "Alice"
 * 2 friends: "Alice & Bob"
 * 3 friends: "Alice, Bob & Charlie"
 * 4+ friends: "Alice, Bob +2 more"
 */
export function formatFriendsText(friends: FriendInfo[]): string {
  const names = friends.map((f) => f.displayName.split(' ')[0] || f.displayName);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} & ${names[2]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}
