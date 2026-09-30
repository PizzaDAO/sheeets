import { NextRequest, NextResponse } from 'next/server';
import { z, ZodSchema } from 'zod';

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns { data } on success or { error: NextResponse } on failure.
 */
export async function parseBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      error: NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`
    );
    return {
      error: NextResponse.json(
        { error: messages.join('; ') },
        { status: 400 }
      ),
    };
  }

  return { data: result.data };
}

/* ------------------------------------------------------------------ */
/* Batch parsing (tracking beacons)                                    */
/* ------------------------------------------------------------------ */

/** Max items accepted per tracking request. Keep in sync with tracking-queue. */
export const MAX_BATCH_ITEMS = 50;

export type BatchParseResult<T> =
  | { items: T[]; dropped: number; error?: never }
  | { items?: never; dropped?: never; error: { status: number; message: string } };

/**
 * Parse a tracking payload that is EITHER a single object (legacy) OR
 * `{ events: [...] }` (batched, up to MAX_BATCH_ITEMS).
 *
 * - Single object: must be valid, else 400 (backwards compatible).
 * - Batch: invalid items are dropped; valid ones are returned.
 * - Batch larger than `max`: 413.
 */
export function parseBatch<T>(
  raw: unknown,
  schema: ZodSchema<T>,
  max: number = MAX_BATCH_ITEMS
): BatchParseResult<T> {
  const isBatch =
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    Array.isArray((raw as { events?: unknown }).events);

  if (!isBatch) {
    const result = schema.safeParse(raw);
    if (!result.success) {
      const messages = result.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`
      );
      return { error: { status: 400, message: messages.join('; ') } };
    }
    return { items: [result.data], dropped: 0 };
  }

  const events = (raw as { events: unknown[] }).events;
  if (events.length > max) {
    return { error: { status: 413, message: `Too many events (max ${max})` } };
  }

  const items: T[] = [];
  for (const e of events) {
    const result = schema.safeParse(e);
    if (result.success) items.push(result.data);
  }
  return { items, dropped: events.length - items.length };
}

/**
 * Read the request body (works for sendBeacon Blobs too — req.json() ignores
 * the content-type) and run parseBatch. Returns { items } or { error }.
 */
export async function parseBatchBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>,
  max: number = MAX_BATCH_ITEMS
): Promise<{ items: T[]; dropped: number; error?: never } | { items?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }

  const result = parseBatch(raw, schema, max);
  if (result.error) {
    return {
      error: NextResponse.json(
        { error: result.error.message },
        { status: result.error.status }
      ),
    };
  }
  return { items: result.items, dropped: result.dropped };
}

// ---------------------------------------------------------------------------
// Shared Zod schemas for API routes
// ---------------------------------------------------------------------------

/** Schema for POST /api/submit-event */
export const SubmitEventSchema = z.object({
  conference: z.string().min(1, 'Conference is required'),
  coords: z.object({ lat: z.number(), lng: z.number() }).optional().nullable(),
  event: z.object({
    name: z.string().min(1, 'Event name is required'),
    date: z.string().min(1, 'Event date is required'),
    startTime: z.string().optional().default(''),
    endTime: z.string().optional().default(''),
    organizer: z.string().optional().default(''),
    address: z.string().optional().default(''),
    cost: z.string().optional().default('Free'),
    tags: z.string().optional().default(''),
    link: z.string().optional().default(''),
    food: z.boolean().optional().default(false),
    bar: z.boolean().optional().default(false),
    note: z.string().optional().default(''),
  }),
});

/** Schema for POST /api/admin/toggle-featured */
export const ToggleFeaturedSchema = z.object({
  password: z.string(),
  conference: z.string().min(1),
  eventName: z.string().min(1),
  featured: z.boolean(),
});

/** Schema for POST /api/admin/config */
export const AdminConfigSchema = z.object({
  password: z.string(),
  key: z.string().min(1, 'Key is required'),
  value: z.unknown(),
});

/** Schema for POST /api/geocode */
export const GeocodeSchema = z.object({
  addresses: z.array(
    z.object({
      normalized: z.string(),
      raw: z.string(),
      conference: z.string(),
    })
  ),
});

/** Schema for GET /api/og (query params parsed separately) */
export const OgBatchSchema = z.object({
  items: z
    .array(
      z.object({
        eventId: z.string(),
        url: z.string(),
      })
    )
    .min(1),
});

/** Schema for POST /api/luma */
export const LumaSchema = z.object({
  url: z.string().min(1, 'URL is required'),
});

/** Schema for POST /api/fetch-event */
export const FetchEventSchema = z.object({
  url: z.string().min(1, 'URL is required'),
});

/** Schema for POST /api/ab/track */
export const ABTrackEventSchema = z.object({
  test_id: z.string().min(1, 'test_id is required'),
  variant_id: z.string().min(1, 'variant_id is required'),
  visitor_id: z.string().min(1, 'visitor_id is required'),
  event_type: z.enum(['impression', 'click', 'conversion']),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Schema for one item of POST /api/events/track */
export const EventTrackSchema = z.object({
  event_id: z.string().min(1, 'event_id is required'),
  event_name: z.string().optional(),
  event_type: z.enum(['click', 'impression', 'pin-click']),
  conference: z.string().optional(),
  visitor_id: z.string().optional(),
  url: z.string().optional(),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Schema for one item of POST /api/ads/track */
export const AdTrackSchema = z.object({
  ad_id: z.string().min(1, 'ad_id is required'),
  ad_name: z.string().optional(),
  placement: z.string().min(1, 'placement is required'),
  event_type: z.enum(['impression', 'click']),
  conference: z.string().optional(),
  visitor_id: z.string().optional(),
  url: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Schema for POST /api/admin/submissions */
export const SubmissionActionSchema = z.object({
  password: z.string(),
  action: z.enum(['approve', 'reject']),
  id: z.string().uuid(),
  rejection_reason: z.string().optional(),
  edits: z.object({
    event_name: z.string().optional(),
    event_date: z.string().optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    organizer: z.string().optional(),
    address: z.string().optional(),
    cost: z.string().optional(),
    tags: z.string().optional(),
    link: z.string().optional(),
    has_food: z.boolean().optional(),
    has_bar: z.boolean().optional(),
    note: z.string().optional(),
  }).optional(),
});
