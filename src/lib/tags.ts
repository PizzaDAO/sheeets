export const VIBE_COLORS: Record<string, string> = {
  // Green group -- event formats
  'Conference': 'var(--tag-green)',
  'Panel/Talk': 'var(--tag-green)',
  'Hackathon': 'var(--tag-green)',
  'Networking': 'var(--tag-green)',
  'Workshop': 'var(--tag-green)',
  'Party': 'var(--tag-green)',
  'Brunch': 'var(--tag-blue)',
  'Meetup': 'var(--tag-green)',
  'Demo Day': 'var(--tag-green)',
  'Dinner': 'var(--tag-blue)',
  'Wellness': 'var(--tag-green)',
  'Performance': 'var(--tag-green)',
  'Art': 'var(--tag-green)',
  'Session': 'var(--tag-green)',
  'Showcase': 'var(--tag-green)',
  'Special Event': 'var(--tag-green)',
  'Activation': 'var(--tag-green)',
  'Lounge': 'var(--tag-green)',
  'Exhibition': 'var(--tag-green)',
  'Screening': 'var(--tag-green)',
  'Vibe': 'var(--tag-green)',
  '$$': 'var(--tag-purple)',
  'Free': 'var(--tag-teal)',
  'Food': 'var(--tag-blue)',
  'Drinks': 'var(--tag-blue)',
  // Blue group -- builders & business
  'Devs': 'var(--tag-blue)',
  'VCs': 'var(--tag-blue)',
  'Founders': 'var(--tag-blue)',
  'Jobs': 'var(--tag-blue)',
  'Jobs/Hiring': 'var(--tag-blue)',
  // Yellow group -- crypto & topics
  'DePIN': 'var(--tag-yellow)',
  'AI': 'var(--tag-yellow)',
  'DeFi': 'var(--tag-yellow)',
  'NFTs': 'var(--tag-yellow)',
  'Memecoins': 'var(--tag-yellow)',
  'Ordinals': 'var(--tag-yellow)',
  'BTC': 'var(--tag-yellow)',
  'ETH': 'var(--tag-yellow)',
  'SOL': 'var(--tag-yellow)',
  'DAOs': 'var(--tag-yellow)',
  'RWA': 'var(--tag-yellow)',
  'Gaming': 'var(--tag-yellow)',
  'Tech': 'var(--tag-yellow)',
  // Pink group -- entertainment & culture
  'Culture': 'var(--tag-pink)',
  'Music': 'var(--tag-pink)',
  'Film/TV': 'var(--tag-pink)',
  'Comedy': 'var(--tag-pink)',
  // Teal -- education
  'Education': 'var(--tag-teal)',
  'default': 'var(--tag-default)',
};

/** Tags that describe event format/type (vs topic/interest tags) */
export const TYPE_TAGS = [
  'Conference',
  'Panel/Talk',
  'Hackathon',
  'Networking',
  'Workshop',
  'Party',
  'Brunch',
  'Meetup',
  'Demo Day',
  'Dinner',
  'Wellness',
  'Performance',
  'Session',
  'Showcase',
  'Special Event',
  'Activation',
  'Lounge',
  'Exhibition',
  'Screening',
  'Vibe',
];

/** Intent-based tag groups for the filter bar UI */
export interface TagGroup {
  label: string;
  tags: string[];
}

export const TAG_GROUPS: TagGroup[] = [
  { label: 'Vibe', tags: ['Party', 'Networking', 'Conference', 'Panel/Talk', 'Hackathon', 'Workshop', 'Wellness', 'Art', 'Performance'] },
  { label: 'Details', tags: ['Food', 'Drinks', 'Free', '$$'] },
  { label: 'Audience', tags: ['Devs', 'VCs', 'Founders', 'Jobs'] },
  { label: 'Topics', tags: ['BTC', 'ETH', 'SOL', 'AI', 'DeFi', 'DAOs', 'NFTs', 'DePIN', 'RWA', 'Memecoins', 'Gaming'] },
];

export const GROUPED_TAGS = new Set(TAG_GROUPS.flatMap(g => g.tags));

/** Tags that should be treated as equivalent when filtering.
 *  Key = alias tag on events, Value = canonical tag shown in filter UI */
export const TAG_ALIASES: Record<string, string> = {
  'Dinner': 'Food',
  'Brunch': 'Food',
  'Bar/Pub': 'Drinks',
  'Jobs/Hiring': 'Jobs',
};
