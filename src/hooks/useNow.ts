'use client';

import { useSyncExternalStore } from 'react';

const TICK_MS = 30_000;

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  now = Date.now();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  // First read happens before any subscription: initialise lazily.
  if (now === 0) now = Date.now();
  return now;
}

/**
 * Current time (ms), shared across components and refreshed every 30s.
 * Keeps render pure (no Date.now() in the component body) while relative
 * "x minutes ago" UI still updates over time. Returns 0 on the server.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
