import { distanceMeters } from './geo';

export const AUTO_CHECKIN_RADIUS_M = 150;
export const AUTO_CHECKIN_DWELL_MS = 90 * 1000;
/** Ignore fixes less precise than this — a 1km cell-tower fix can't tell you're at a venue. */
export const AUTO_CHECKIN_MAX_ACCURACY_M = 200;

export interface DwellCandidateEvent {
  id: string;
  lat: number;
  lng: number;
}

export interface DwellFix {
  lat: number;
  lng: number;
  /** Reported accuracy radius in meters (optional). */
  accuracy?: number | null;
}

/** eventId -> timestamp (ms) when the user was first seen continuously within range. */
export type DwellState = ReadonlyMap<string, number>;

export interface DwellOptions {
  radiusM?: number;
  dwellMs?: number;
  maxAccuracyM?: number;
  /** Event ids that must never be auto-checked-in (already checked in, undone, done this session). */
  exclude?: ReadonlySet<string>;
}

export interface DwellResult {
  state: Map<string, number>;
  /** Events the user has now dwelt at long enough to auto check in. */
  ready: string[];
}

/**
 * Pure dwell tracker. Call with every position fix (and periodically with the
 * last known fix so a stationary user still crosses the dwell threshold).
 *
 * - Entering range starts a timer for that event; leaving range resets it.
 * - Imprecise fixes are ignored entirely (state unchanged, nothing ready).
 * - Events no longer in `events` (ended / removed from plan) are dropped.
 */
export function updateDwell(
  prev: DwellState,
  fix: DwellFix,
  events: DwellCandidateEvent[],
  nowMs: number,
  {
    radiusM = AUTO_CHECKIN_RADIUS_M,
    dwellMs = AUTO_CHECKIN_DWELL_MS,
    maxAccuracyM = AUTO_CHECKIN_MAX_ACCURACY_M,
    exclude,
  }: DwellOptions = {},
): DwellResult {
  if (fix.accuracy != null && fix.accuracy > maxAccuracyM) {
    // Keep only timers for events that are still candidates.
    const kept = new Map<string, number>();
    const ids = new Set(events.map((e) => e.id));
    for (const [id, t] of prev) if (ids.has(id) && !exclude?.has(id)) kept.set(id, t);
    return { state: kept, ready: [] };
  }

  const state = new Map<string, number>();
  const ready: string[] = [];
  for (const e of events) {
    if (exclude?.has(e.id)) continue;
    if (distanceMeters(fix.lat, fix.lng, e.lat, e.lng) > radiusM) continue;
    const since = prev.get(e.id) ?? nowMs;
    state.set(e.id, since);
    if (nowMs - since >= dwellMs) ready.push(e.id);
  }
  return { state, ready };
}
