import type { SupabaseClient } from '@supabase/supabase-js';

export interface CachedProfile {
  user_id: string;
  email: string | null;
  display_name: string | null;
  x_handle: string | null;
  rsvp_name: string | null;
  avatar_url: string | null;
  x_verified: boolean;
}

const cache = new Map<string, CachedProfile>();

export async function fetchProfiles(
  client: SupabaseClient,
  userIds: string[]
): Promise<Map<string, CachedProfile>> {
  const result = new Map<string, CachedProfile>();
  const uncached: string[] = [];

  for (const id of userIds) {
    const cached = cache.get(id);
    if (cached) {
      result.set(id, cached);
    } else {
      uncached.push(id);
    }
  }

  if (uncached.length > 0) {
    const { data } = await client
      .from('profiles')
      .select('user_id, email, display_name, x_handle, rsvp_name, avatar_url, x_verified')
      .in('user_id', uncached);

    for (const p of data ?? []) {
      const profile: CachedProfile = {
        user_id: p.user_id,
        email: p.email ?? null,
        display_name: p.display_name ?? null,
        x_handle: p.x_handle ?? null,
        rsvp_name: p.rsvp_name ?? null,
        avatar_url: p.avatar_url ?? null,
        x_verified: p.x_verified ?? false,
      };
      cache.set(p.user_id, profile);
      result.set(p.user_id, profile);
    }
  }

  return result;
}

export function invalidateProfiles(userIds?: string[]) {
  if (!userIds) {
    cache.clear();
  } else {
    for (const id of userIds) cache.delete(id);
  }
}
