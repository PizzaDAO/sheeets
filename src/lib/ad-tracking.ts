/**
 * Per-ad impression and click tracking to Supabase ad_events table.
 *
 * - Reuses the visitor ID from A/B testing (localStorage `sheeets-ab-visitor`)
 * - Deduplicates impressions per ad_id per page session (in-memory Set)
 * - Batched via tracking-queue: impressions flush every ~3s, clicks immediately
 * - Fire-and-forget: never blocks UI, never surfaces errors
 */

import { getVisitorId } from './ab-testing';
import { createTrackingQueue } from './tracking-queue';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface AdTrackParams {
  ad_id: string;
  ad_name?: string;
  placement: 'native-ad' | 'sponsor-ticker' | 'featured-event' | 'profile';
  event_type: 'impression' | 'click';
  conference?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Session deduplication                                                */
/* ------------------------------------------------------------------ */

const trackedImpressions = new Set<string>();

const queue = createTrackingQueue<Record<string, unknown>>('/api/ads/track');

/* ------------------------------------------------------------------ */
/* Main tracking function                                              */
/* ------------------------------------------------------------------ */

/**
 * Track an ad event (impression or click) to the Supabase ad_events table.
 *
 * - Impressions are deduplicated per ad_id per page session.
 * - Clicks are always tracked.
 * - Fire-and-forget: errors are silently caught.
 */
export function trackAdEvent(params: AdTrackParams): void {
  // Deduplicate impressions per ad_id per session
  if (params.event_type === 'impression') {
    const key = `${params.ad_id}:${params.placement}`;
    if (trackedImpressions.has(key)) return;
    trackedImpressions.add(key);
  }

  const visitor_id = getVisitorId();
  if (!visitor_id) return;

  queue.enqueue(
    {
      ad_id: params.ad_id,
      ad_name: params.ad_name,
      placement: params.placement,
      event_type: params.event_type,
      conference: params.conference,
      visitor_id,
      url: params.url,
      metadata: params.metadata,
    },
    // Clicks flush immediately so outbound navigations don't drop them
    { immediate: params.event_type === 'click' }
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Slugify a sponsor name for use as an ad_id.
 * "Stand With Crypto" -> "sponsor-stand-with-crypto"
 */
export function slugifySponsor(linkText: string): string {
  return (
    'sponsor-' +
    linkText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}
