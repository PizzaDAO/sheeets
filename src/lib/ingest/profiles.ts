// Default per-theme profiles (§6, §9.1). Phase 1a keeps these in code; Phase 1b
// seeds the `ingest_profiles` table from this map and lets admins edit per
// conference from there. Thresholds match the plan's defaults (publish 85 /
// review 40) and can be overridden per conference once the DB table exists.
import type { ThemeProfile, ThemeKey } from './types';

export const DEFAULT_PUBLISH_THRESHOLD = 85;
export const DEFAULT_REVIEW_THRESHOLD = 40;

const base = (
  themeKey: ThemeKey,
  themeName: string,
  themeDescription: string,
  includeKeywords: string[],
  excludeKeywords: string[] = []
): ThemeProfile => ({
  themeKey,
  themeName,
  themeDescription,
  includeKeywords,
  excludeKeywords,
  publishThreshold: DEFAULT_PUBLISH_THRESHOLD,
  reviewThreshold: DEFAULT_REVIEW_THRESHOLD,
});

export const DEFAULT_THEME_PROFILES: Record<Exclude<ThemeKey, 'custom'>, ThemeProfile> = {
  crypto: base(
    'crypto',
    'Crypto / Web3',
    'Crypto, blockchain and Web3 industry side events: builder meetups, protocol and ' +
      'exchange parties, DeFi/NFT/DAO talks, founder and VC networking, hackathons and ' +
      'demo days held around a crypto conference week. Generic city nightlife or tourism ' +
      'events with no crypto, Web3 or blockchain angle are off-theme even if well attended.',
    [
      'crypto', 'web3', 'blockchain', 'defi', 'nft', 'dao', 'token', 'ethereum', 'eth',
      'bitcoin', 'btc', 'solana', 'sol', 'stablecoin', 'wallet', 'exchange', 'onchain',
      'depin', 'rwa', 'l2', 'rollup', 'validator', 'airdrop',
    ],
    ['mlm', 'pyramid scheme', 'get rich quick', 'forex signals']
  ),
  ai: base(
    'ai',
    'AI / Machine Learning',
    'AI and machine learning industry side events: model and infra builder meetups, ' +
      'applied-AI demo days, research talks, founder and VC networking tied to an AI ' +
      'conference or AI week. Generic tech meetups with no AI/ML focus are off-theme.',
    [
      'ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'genai',
      'generative ai', 'agents', 'agentic', 'foundation model', 'neural network',
      'deep learning', 'nlp', 'computer vision',
    ],
    ['mlm', 'pyramid scheme']
  ),
  gaming: base(
    'gaming',
    'Gaming',
    'Video game industry side events around a gaming conference (e.g. GDC): studio and ' +
      'publisher mixers, game dev talks, showcases, esports and indie-dev networking. ' +
      'Generic nightlife with no gaming-industry angle is off-theme.',
    [
      'game', 'gaming', 'gamedev', 'game dev', 'esports', 'indie game', 'studio',
      'publisher', 'unreal', 'unity', 'playtest', 'showcase',
    ]
  ),
  art: base(
    'art',
    'Art',
    'Art-world side events: gallery and studio openings, artist talks, exhibitions and ' +
      'collector networking tied to an art fair or art week. Generic parties with no art ' +
      'program are off-theme.',
    ['art', 'gallery', 'exhibition', 'artist', 'studio visit', 'opening reception', 'collector']
  ),
  music: base(
    'music',
    'Music',
    'Music-industry side events: label and artist showcases, listening parties, producer ' +
      'and DJ networking tied to a music festival or conference week. Generic bar nights ' +
      'with no music-industry program are off-theme.',
    ['music', 'label', 'producer', 'dj', 'showcase', 'listening party', 'artist', 'festival']
  ),
  tech: base(
    'tech',
    'General Tech',
    'Startup and general-tech side events: founder and VC networking, product demo days, ' +
      'hackathons and developer meetups tied to a tech conference week, not specific to ' +
      'any one vertical. Pure consumer nightlife with no startup/tech program is off-theme.',
    ['startup', 'founder', 'vc', 'venture', 'demo day', 'hackathon', 'developer', 'product launch']
  ),
};

export function getDefaultProfile(themeKey: ThemeKey): ThemeProfile {
  if (themeKey === 'custom') {
    return base('custom', 'Custom', '', []);
  }
  return DEFAULT_THEME_PROFILES[themeKey];
}
