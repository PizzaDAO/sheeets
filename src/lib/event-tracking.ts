/**
 * Per-event click, impression, and pin-click tracking to Supabase event_tracking table.
 *
 * - Reuses the visitor ID from A/B testing (localStorage `sheeets-ab-visitor`)
 * - Deduplicates per event_id + event_type per page session (in-memory Set)
 * - Batched via tracking-queue: impressions flush every ~3s, clicks immediately
 * - Fire-and-forget: never blocks UI, never surfaces errors
 */

import { getVisitorId } from './ab-testing';
import { createTrackingQueue } from './tracking-queue';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface EventTrackParams {
  event_id: string;
  event_name?: string;
  event_type: 'click' | 'impression' | 'pin-click';
  conference?: string;
  url?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Session deduplication                                                */
/* ------------------------------------------------------------------ */

const trackedEvents = new Set<string>();

const queue = createTrackingQueue<Record<string, unknown>>('/api/events/track');

/* ------------------------------------------------------------------ */
/* Main tracking function                                              */
/* ------------------------------------------------------------------ */

/**
 * Track an event interaction (click, impression, or pin-click) to the
 * Supabase event_tracking table.
 *
 * - All event types are deduplicated per event_id:event_type per page session.
 * - Impressions are batched; clicks and pin-clicks are sent immediately.
 * - Fire-and-forget: errors are silently caught.
 */
export function trackEvent(params: EventTrackParams): void {
  const key = `${params.event_id}:${params.event_type}`;
  if (trackedEvents.has(key)) return;
  trackedEvents.add(key);

  const visitor_id = getVisitorId();
  if (!visitor_id) return;

  queue.enqueue(
    {
      event_id: params.event_id,
      event_name: params.event_name,
      event_type: params.event_type,
      conference: params.conference,
      visitor_id,
      url: params.url,
      source: params.source,
      metadata: params.metadata,
    },
    // Clicks flush immediately so outbound navigations don't drop them
    { immediate: params.event_type !== 'impression' }
  );
}
