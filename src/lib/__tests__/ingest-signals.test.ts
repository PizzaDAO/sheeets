import { describe, it, expect } from 'vitest';
import { computeSignals, combineFinalScore, meetsPublishFloor, routeCandidate } from '../ingest/signals';

describe('computeSignals', () => {
  it('scores trusted calendar, trusted host and sponsor match additively', () => {
    const r = computeSignals({
      isTrustedCalendarSource: true,
      isTrustedHost: true,
      sponsorMatch: 'Coinbase',
      text: 'Builders brunch hosted by Coinbase',
      includeKeywords: [],
      excludeKeywords: [],
    });
    expect(r.breakdown.trusted_calendar).toBe(15);
    expect(r.breakdown.trusted_host).toBe(20);
    expect(r.breakdown['sponsor:Coinbase']).toBe(10);
    expect(r.total).toBe(45);
    expect(r.hardReject).toBe(false);
    expect(r.capRouteAtReview).toBe(false);
  });

  it('matches include keywords on word boundaries and caps at +15', () => {
    const r = computeSignals({
      text: 'A DeFi and NFT and DAO party with crypto vibes',
      includeKeywords: ['defi', 'nft', 'dao', 'crypto'],
      excludeKeywords: [],
    });
    // 4 matches * 5 = 20, capped to 15
    expect(r.total).toBe(15);
  });

  it('does not match a keyword glued to other alphanumerics', () => {
    const r = computeSignals({
      text: 'aidrop and said hello', // "ai" should not match inside "said"
      includeKeywords: ['ai'],
      excludeKeywords: [],
    });
    expect(r.total).toBe(0);
  });

  it('applies a flat -40 for an exclude keyword hit', () => {
    const r = computeSignals({
      text: 'Join our forex signals group',
      includeKeywords: [],
      excludeKeywords: ['forex signals'],
    });
    expect(r.total).toBe(-40);
    expect(r.hardReject).toBe(false);
  });

  it('hard-rejects a blocked host and applies -40', () => {
    const r = computeSignals({
      isBlockedHost: true,
      text: 'Some event',
      includeKeywords: [],
      excludeKeywords: [],
    });
    expect(r.hardReject).toBe(true);
    expect(r.breakdown.blocked_host).toBe(-40);
  });

  it('caps the route at review for injection, possible-duplicate or no-geo, without changing score', () => {
    const r1 = computeSignals({ text: '', includeKeywords: [], excludeKeywords: [], injectionDetected: true });
    const r2 = computeSignals({ text: '', includeKeywords: [], excludeKeywords: [], possibleDuplicate: true });
    const r3 = computeSignals({ text: '', includeKeywords: [], excludeKeywords: [], noGeo: true });
    expect(r1.capRouteAtReview).toBe(true);
    expect(r1.total).toBe(0);
    expect(r2.capRouteAtReview).toBe(true);
    expect(r3.capRouteAtReview).toBe(true);
  });
});

describe('combineFinalScore', () => {
  it('clamps to [0, 100]', () => {
    const noSignals = computeSignals({ text: '', includeKeywords: [], excludeKeywords: [] });
    expect(combineFinalScore(95, { ...noSignals, total: 20 })).toBe(100);
    expect(combineFinalScore(10, { ...noSignals, total: -40 })).toBe(0);
    expect(combineFinalScore(50, { ...noSignals, total: 10 })).toBe(60);
  });
});

describe('meetsPublishFloor', () => {
  it('requires llm_score >= publishThreshold - 15', () => {
    expect(meetsPublishFloor(70, 85)).toBe(true);
    expect(meetsPublishFloor(69, 85)).toBe(false);
  });
});

describe('routeCandidate', () => {
  const profile = { publishThreshold: 85, reviewThreshold: 40 };

  it('rejects when is_event is false, regardless of score', () => {
    const signals = computeSignals({ text: '', includeKeywords: [], excludeKeywords: [] });
    expect(routeCandidate({ isEvent: false, llmScore: 99, signals, profile })).toBe('reject');
  });

  it('rejects on a hard-reject signal (blocked host) regardless of score', () => {
    const signals = computeSignals({ isBlockedHost: true, text: '', includeKeywords: [], excludeKeywords: [] });
    expect(routeCandidate({ isEvent: true, llmScore: 99, signals, profile })).toBe('reject');
  });

  it('publishes when final >= publish and the floor is met and nothing caps the route', () => {
    const signals = computeSignals({ isTrustedHost: true, text: '', includeKeywords: [], excludeKeywords: [] });
    // llm 75 + trusted_host 20 = 95 final, floor needs llm>=70
    expect(routeCandidate({ isEvent: true, llmScore: 75, signals, profile })).toBe('publish');
  });

  it('does not publish a weak score even if signals push the final over the threshold (the floor)', () => {
    const lowSignals = computeSignals({
      isTrustedHost: true,
      isTrustedCalendarSource: true,
      text: '',
      includeKeywords: [],
      excludeKeywords: [],
    });
    // llm 68 + 35 = 100 final >= 85, but floor requires llm >= 70 -> fails -> review, not publish
    expect(routeCandidate({ isEvent: true, llmScore: 68, signals: lowSignals, profile })).not.toBe('publish');
  });

  it('caps a possible-duplicate at review even with a publish-level score', () => {
    const signals = computeSignals({
      possibleDuplicate: true,
      text: '',
      includeKeywords: [],
      excludeKeywords: [],
    });
    expect(routeCandidate({ isEvent: true, llmScore: 95, signals, profile })).toBe('review');
  });

  it('falls to review between the two thresholds, and reject below review', () => {
    const signals = computeSignals({ text: '', includeKeywords: [], excludeKeywords: [] });
    expect(routeCandidate({ isEvent: true, llmScore: 50, signals, profile })).toBe('review');
    expect(routeCandidate({ isEvent: true, llmScore: 10, signals, profile })).toBe('reject');
  });
});
