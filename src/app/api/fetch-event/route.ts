import { NextRequest, NextResponse } from 'next/server';
import { parseBody, FetchEventSchema } from '@/lib/api-validation';
import { SafeFetchError } from '@/lib/safe-fetch';
import {
  detectPlatform,
  parseLuma,
  parseEventbrite,
  parsePartiful,
  parseMeetup,
  parsePosh,
  parseGeneric,
  UserFacingError,
  type EventResult,
} from '@/lib/event-extractors';

// safeFetch relies on node:http/node:dns for SSRF protection
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { data, error } = await parseBody(request, FetchEventSchema);
    if (error) return error;

    const trimmedUrl = data.url.trim();

    // Validate it looks like a URL
    try {
      new URL(trimmedUrl);
    } catch {
      return NextResponse.json({ error: 'Please enter a valid URL.' }, { status: 400 });
    }

    const platform = detectPlatform(trimmedUrl);
    let result: EventResult;

    switch (platform) {
      case 'luma':
        result = await parseLuma(trimmedUrl);
        break;
      case 'eventbrite':
        result = await parseEventbrite(trimmedUrl);
        break;
      case 'partiful':
        result = await parsePartiful(trimmedUrl);
        break;
      case 'meetup':
        result = await parseMeetup(trimmedUrl);
        break;
      case 'posh':
        result = await parsePosh(trimmedUrl);
        break;
      default:
        result = await parseGeneric(trimmedUrl);
        break;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('fetch-event API error:', err);
    // Only surface messages we wrote ourselves; never raw upstream/network errors
    const message =
      err instanceof SafeFetchError || err instanceof UserFacingError
        ? err.message
        : 'Failed to fetch event details.';
    return NextResponse.json(
      { error: message },
      { status: 422 }
    );
  }
}
