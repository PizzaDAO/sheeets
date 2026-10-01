'use client';

import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * `false` during SSR and hydration, `true` once rendering on the client.
 * Hydration-safe replacement for the `useEffect(() => setMounted(true), [])` pattern
 * (e.g. to gate `createPortal(…, document.body)`).
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
