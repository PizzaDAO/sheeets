'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Same-tab subscribers per key, notified when this hook writes the key.
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

// Values written in this tab. Read first so state still updates when
// localStorage is unavailable (private mode / quota errors).
const written = new Map<string, string>();

function readRaw(key: string): string | null {
  if (written.has(key)) return written.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * localStorage-backed state that is safe for SSR + hydration.
 *
 * Renders `serverValue` on the server and during hydration, then switches to the
 * stored value on the client (React re-renders right after hydration when they
 * differ) — the useSyncExternalStore replacement for the
 * `useEffect(() => setState(localStorage.getItem(...)), [])` pattern.
 *
 * `parse` maps the raw stored string (or null) to a value. It runs on every
 * render, so it must return a stable (primitive or cached) value for the same input.
 */
export function useLocalStorageState<T>(
  key: string,
  parse: (raw: string | null) => T,
  serverValue: T,
  serialize: (value: T) => string = String
): [T, (value: T) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(onChange);
      return () => {
        set.delete(onChange);
      };
    },
    [key]
  );

  const value = useSyncExternalStore(
    subscribe,
    () => parse(readRaw(key)),
    () => serverValue
  );

  const setValue = useCallback(
    (next: T) => {
      const raw = serialize(next);
      written.set(key, raw);
      try {
        localStorage.setItem(key, raw);
      } catch {
        // Storage unavailable (private mode / quota) — nothing to persist to.
      }
      notify(key);
    },
    [key, serialize]
  );

  return [value, setValue];
}
