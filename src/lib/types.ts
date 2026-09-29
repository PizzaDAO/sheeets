export interface ConferenceConfig {
  gid: number;           // Google Sheet tab GID
  name: string;          // Display name, e.g. "PBW 2026"
  slug: string;          // URL slug, e.g. "pbw"
  timezone: string;      // IANA timezone, e.g. "Europe/Paris"
  startDate: string;     // ISO date: "2026-04-11"
  endDate: string;       // ISO date: "2026-04-17"
  center: { lat: number; lng: number }; // Map center + geocoding proximity
  hidden?: boolean;      // Manually hidden by admin
}

export interface ETHDenverEvent {
  id: string;
  date: string;          // Raw: "Tue, Feb 10"
  dateISO: string;       // Parsed: "2026-02-10"
  startTime: string;     // Raw: "12:00p" or "6:00 PM"
  endTime: string;       // Raw
  isAllDay: boolean;
  organizer: string;
  name: string;
  address: string;
  cost: string;
  isFree: boolean;
  vibe: string;          // Primary tag (first tag)
  tags: string[];        // All tags from comma-separated Tags column
  conference: string;    // Which tab/conference this event belongs to
  link: string;
  hasFood: boolean;
  hasBar: boolean;
  note: string;
  lat?: number;
  lng?: number;
  matchedAddress?: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | 'all-day';
  isDuplicate?: boolean;
  isFeatured?: boolean;
}

export interface FilterState {
  conference: string;
  startDateTime: string;  // ISO local: "2026-02-16T14:00"
  endDateTime: string;    // ISO local: "2026-02-21T23:59"
  vibes: string[];
  tagMatchAll: boolean;  // true = AND (all tags), false = OR (any tag)
  selectedFriends: string[];
  itineraryOnly: boolean;
  searchQuery: string;
  timeMode: 'off' | 'now' | 'today' | 'tomorrow';
  selectedOrgs: string[];
}

export interface UserState {
  itinerary: string[];
}

export type ViewMode = 'map' | 'list' | 'table' | 'gallery';

export interface UserProfile {
  user_id: string;
  email: string | null;
  display_name: string | null;
  x_handle: string | null;
  rsvp_name: string | null;
  avatar_url: string | null;
  telegram_handle: string | null;
  company: string | null;
  linkedin_url: string | null;
  job_title: string | null;
  phone: string | null;
  website: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface Friend {
  user_id: string;
  email: string | null;
  display_name: string | null;
  x_handle: string | null;
  rsvp_name: string | null;
  avatar_url: string | null;
}

export interface FriendInfo {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  xHandle?: string | null;
}

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  sender_profile?: { display_name: string | null; email: string | null; x_handle: string | null; avatar_url?: string | null };
  receiver_profile?: { display_name: string | null; email: string | null; x_handle: string | null; avatar_url?: string | null };
}

export interface UserSearchResult {
  user_id: string;
  display_name: string | null;
  x_handle: string | null;
  email: string | null;
  rsvp_name: string | null;
  avatar_url: string | null;
  request_status: 'pending_outgoing' | 'pending_incoming' | null;
}

export type ReactionEmoji = typeof import('./reactions').REACTION_EMOJIS[number];

export interface EventReaction {
  id: string;
  event_id: string;
  user_id: string;
  emoji: ReactionEmoji;
  visibility: 'public' | 'friends';
  created_at: string;
}

export interface EventComment {
  id: string;
  event_id: string;
  user_id: string;
  text: string;
  visibility: 'public' | 'friends';
  created_at: string;
  display_name?: string;
  x_handle?: string;
  rsvp_name?: string;
  avatar_url?: string;
  job_title?: string;
  company?: string;
  linkedin_url?: string;
  telegram_handle?: string;
}

export interface FriendLocation {
  user_id: string;
  lat: number;
  lng: number;
  updated_at: string;
  display_name?: string;
  x_handle?: string;
  avatar_url?: string;
}

export type POICategory = 'pin' | 'hotel' | 'food' | 'drink' | 'work' | 'meeting';

export interface POI {
  id: string;
  user_id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  category: POICategory;
  note: string | null;
  conference: string | null;
  is_public: boolean;
  created_at: string;
}

export interface SponsorEntry {
  beforeText: string;
  linkText: string;
  afterText: string;
  url: string;
  ab?: {
    b: { beforeText: string; linkText: string; afterText: string; url: string };
    weightA: number;
    weightB: number;
    enabled: boolean;
  };
}

export interface NativeAd {
  id: string;
  title: string;
  description: string;
  link: string;
  imageUrl: string;
  conference: string;
  badge: string;
  active: boolean;
  ab?: {
    b: { title: string; description: string; link: string; imageUrl: string; badge: string };
    weightA: number;
    weightB: number;
    enabled: boolean;
  };
}

export interface UpsellCopy {
  heading: string;
  body: string;
  cta_text: string;
  cta_url: string;
}

export interface AdInventoryItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  price: string;
  priceNote?: string;
  stats?: string;
  features: string[];
  imageUrl?: string;
  badge?: string;
  available: boolean;
  sortOrder: number;
}

export interface SponsorshipTier {
  name: string;
  price: string;
  features: string[];
  highlighted: boolean;
}

export interface AdvertisePageConfig {
  heroHeading: string;
  heroSubheading: string;
  statsLine: string;
  ctaText: string;
  ctaUrl: string;
  ctaSecondaryText: string;
  ctaSecondaryUrl: string;
  footerText: string;
  tiersEnabled: boolean;
  tiers: SponsorshipTier[];
}

export interface AdminConfig {
  sponsors: SponsorEntry[];
  sponsors_cta: { text: string };
  native_ads: NativeAd[];
  upsell_copy: UpsellCopy;
  ad_inventory?: AdInventoryItem[];
  advertise_page?: AdvertisePageConfig;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Event Sponsors (crawled from event pages)                           */
/* ------------------------------------------------------------------ */

export interface EventSponsor {
  id: number;
  event_id: string;
  event_name: string;
  event_url: string;
  conference: string;
  sponsor_name: string;
  sponsor_url: string | null;
  sponsor_logo_url: string | null;
  sponsor_type: 'sponsor' | 'partner' | 'presenter' | 'host' | 'individual';
  confidence: 'high' | 'medium' | 'low';
  extraction_method: 'api' | 'json-ld' | 'html-section' | 'description' | 'ai' | 'vision';
  crawled_at: string;
}

/* ------------------------------------------------------------------ */
/* A/B Testing                                                         */
/* ------------------------------------------------------------------ */

export type ABTestStatus = 'draft' | 'running' | 'paused' | 'completed';

export interface ABTestVariant {
  id: string;           // e.g. 'control', 'variant-a'
  name: string;         // Human-readable label
  weight: number;       // 0-100 traffic allocation
  config: Record<string, unknown>; // Variant-specific config values
}

export interface ABTest {
  id: string;
  name: string;
  description: string;
  status: ABTestStatus;
  /** Where the test applies: 'native-ad-content' | 'sponsor-copy' | 'ad-frequency' | 'hero-copy' | 'tier-layout' etc. */
  placement: string;
  /** Optional conference scope; empty = global */
  conference: string;
  variants: ABTestVariant[];
  /** Winner variant id, set when test is completed */
  winnerId?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface ABEvent {
  id?: string;
  test_id: string;
  variant_id: string;
  visitor_id: string;
  event_type: 'impression' | 'click' | 'conversion';
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface ABTestResults {
  test_id: string;
  variants: ABVariantResult[];
}

export interface ABVariantResult {
  variant_id: string;
  variant_name: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;          // clicks / impressions
  cvr: number;          // conversions / impressions
}

/* ------------------------------------------------------------------ */
/* Crawled Sponsor Data                                                */
/* ------------------------------------------------------------------ */

export interface SponsorCrawlLogEntry {
  event_url: string;
  event_id: string;
  conference: string;
  status: 'success' | 'no_sponsors' | 'error' | 'skipped';
  sponsors_found: number;
  error_message: string | null;
  crawled_at: string;
}

export interface SponsorDataSummary {
  total_sponsors: number;
  total_events_crawled: number;
  events_with_sponsors: number;
  events_with_errors: number;
  events_no_sponsors: number;
  unique_sponsor_names: number;
  by_confidence: { high: number; medium: number; low: number };
  by_method: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Event Submissions (admin approval queue)                            */
/* ------------------------------------------------------------------ */

export interface Submission {
  id: string;
  conference: string;
  status: 'pending' | 'approved' | 'rejected';
  event_name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  organizer: string;
  address: string;
  cost: string;
  tags: string;
  link: string;
  has_food: boolean;
  has_bar: boolean;
  note: string;
  coords_lat: number | null;
  coords_lng: number | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  sheet_row: number | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Batch RSVP (Luma form scanning + registration)                      */
/* ------------------------------------------------------------------ */

export interface LumaRegistrationQuestion {
  id: string;
  label: string;
  question_type: 'company' | 'text' | 'linkedin' | 'twitter' | 'dropdown' | 'multi-select' | 'terms';
  is_required: boolean;
  options?: string[];           // for dropdown / multi-select
  terms_content?: string;       // for terms type
  job_title_label?: string;     // for company type
}

export interface LumaFormField {
  id: number;
  luma_slug: string;
  event_api_id: string;
  event_name: string | null;
  name_requirement: string | null;
  questions: LumaRegistrationQuestion[];
  scanned_at: string;
}

export type BatchRsvpJobStatus = 'pending' | 'submitting' | 'success' | 'failed';

export interface BatchRsvpJob {
  id: number;
  user_id: string;
  event_id: string;
  luma_slug: string;
  event_name: string | null;
  event_api_id: string;
  status: BatchRsvpJobStatus;
  error_message: string | null;
  profile_snapshot: Record<string, string>;
  custom_answers: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldAnswer {
  id: number;
  user_id: string;
  question_label: string;
  question_type: string;
  answer: string;
  updated_at: string;
}
