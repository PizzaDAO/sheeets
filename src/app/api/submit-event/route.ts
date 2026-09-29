import { NextRequest, NextResponse } from 'next/server';
import { appendEventRow, getSheetTitle } from '@/lib/google-sheets';
import { FALLBACK_TABS } from '@/lib/conferences';
import { getConferenceTabs } from '@/lib/get-conferences';
import { parseBody, SubmitEventSchema } from '@/lib/api-validation';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { data, error } = await parseBody(request, SubmitEventSchema);
    if (error) return error;

    const { conference, coords, event } = data;

    // Try dynamic conferences, fall back to hardcoded
    let tabs = FALLBACK_TABS;
    try {
      tabs = await getConferenceTabs();
    } catch {
      // Use fallback
    }

    const tab = tabs.find((t) => t.name === conference);
    if (!tab) {
      return NextResponse.json(
        { error: `Invalid conference: ${conference}. Valid options: ${tabs.map((t) => t.name).join(', ')}` },
        { status: 400 }
      );
    }

    const sheetName = await getSheetTitle(tab.gid);

    // Write to sheet review section (primary — must succeed)
    const row = await appendEventRow(sheetName, {
      date: event.date.trim(),
      startTime: event.startTime.trim(),
      endTime: event.endTime.trim(),
      organizer: event.organizer.trim(),
      name: event.name.trim(),
      address: event.address.trim(),
      cost: event.cost.trim(),
      tags: event.tags.trim(),
      link: event.link.trim(),
      food: event.food,
      bar: event.bar,
      note: event.note.trim(),
    });

    // Track in Supabase (non-fatal — wrapped in try/catch)
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await supabase.from('event_submissions').insert({
        conference,
        status: 'pending',
        event_name: event.name.trim(),
        event_date: event.date.trim(),
        start_time: event.startTime.trim(),
        end_time: event.endTime.trim(),
        organizer: event.organizer.trim(),
        address: event.address.trim(),
        cost: event.cost.trim(),
        tags: event.tags.trim(),
        link: event.link.trim(),
        has_food: event.food,
        has_bar: event.bar,
        note: event.note.trim(),
        coords_lat: coords?.lat ?? null,
        coords_lng: coords?.lng ?? null,
        sheet_row: row,
      });
    } catch (trackErr) {
      console.error('Failed to track submission in Supabase:', trackErr);
    }

    // Note: client-supplied coords are stored on the submission only. They are
    // written to the shared geocoded_addresses table on admin approval (or by
    // the geocode cron), never directly from an unauthenticated submission.

    return NextResponse.json({ success: true, row, pending: true });
  } catch (err) {
    console.error('Submit event error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to submit event: ${message}` },
      { status: 500 }
    );
  }
}
