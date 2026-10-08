import { describe, it, expect } from 'vitest';
import { updateDwell, AUTO_CHECKIN_DWELL_MS, type DwellState } from '../auto-checkin';

// ~0.001 deg lat ≈ 111m
const venue = { id: 'e1', lat: 40.7128, lng: -74.006 };
const atVenue = { lat: 40.7129, lng: -74.006 }; // ~11m away
const nearEdge = { lat: 40.7140, lng: -74.006 }; // ~133m away
const farAway = { lat: 40.7228, lng: -74.006 }; // ~1.1km away

const T0 = 1_000_000;

function run(steps: Array<{ t: number; fix: { lat: number; lng: number; accuracy?: number } }>, exclude?: Set<string>) {
  let state: DwellState = new Map();
  const readyAt: Array<{ t: number; ready: string[] }> = [];
  for (const { t, fix } of steps) {
    const r = updateDwell(state, fix, [venue], t, { exclude });
    state = r.state;
    readyAt.push({ t, ready: r.ready });
  }
  return { state, readyAt };
}

describe('updateDwell', () => {
  it('is not ready on first entering range', () => {
    const r = updateDwell(new Map(), atVenue, [venue], T0);
    expect(r.ready).toEqual([]);
    expect(r.state.get('e1')).toBe(T0);
  });

  it('becomes ready after staying within range for the dwell period', () => {
    const { readyAt } = run([
      { t: T0, fix: atVenue },
      { t: T0 + 45_000, fix: nearEdge },
      { t: T0 + AUTO_CHECKIN_DWELL_MS - 1, fix: atVenue },
      { t: T0 + AUTO_CHECKIN_DWELL_MS, fix: atVenue },
    ]);
    expect(readyAt.map((r) => r.ready)).toEqual([[], [], [], ['e1']]);
  });

  it('resets the timer when the user walks out of range (walking past)', () => {
    const { readyAt, state } = run([
      { t: T0, fix: atVenue },
      { t: T0 + 30_000, fix: farAway },
      { t: T0 + 60_000, fix: atVenue },
      { t: T0 + 120_000, fix: atVenue },
    ]);
    expect(readyAt.every((r) => r.ready.length === 0)).toBe(true);
    expect(state.get('e1')).toBe(T0 + 60_000);
  });

  it('ignores imprecise fixes without resetting an in-progress dwell', () => {
    const { readyAt } = run([
      { t: T0, fix: atVenue },
      { t: T0 + 60_000, fix: { ...farAway, accuracy: 1500 } },
      { t: T0 + 100_000, fix: { ...atVenue, accuracy: 30 } },
    ]);
    expect(readyAt[1].ready).toEqual([]);
    expect(readyAt[2].ready).toEqual(['e1']);
  });

  it('never readies excluded events (undone / already checked in)', () => {
    const { readyAt, state } = run(
      [
        { t: T0, fix: atVenue },
        { t: T0 + 200_000, fix: atVenue },
      ],
      new Set(['e1'])
    );
    expect(readyAt.every((r) => r.ready.length === 0)).toBe(true);
    expect(state.size).toBe(0);
  });

  it('drops timers for events that are no longer candidates', () => {
    const first = updateDwell(new Map(), atVenue, [venue], T0);
    const second = updateDwell(first.state, atVenue, [], T0 + 200_000);
    expect(second.ready).toEqual([]);
    expect(second.state.size).toBe(0);
  });
});
