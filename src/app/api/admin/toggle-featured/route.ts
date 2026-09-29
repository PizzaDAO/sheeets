import { NextRequest, NextResponse } from 'next/server';
import { readRange, writeCell, getSheetTitle } from '@/lib/google-sheets';
import { FALLBACK_TABS } from '@/lib/conferences';
import { getConferenceTabs } from '@/lib/get-conferences';
import { parseBody, ToggleFeaturedSchema } from '@/lib/api-validation';
import { isAdminPassword } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const { data, error } = await parseBody(request, ToggleFeaturedSchema);
    if (error) return error;

    const { password, conference, eventName, featured } = data;

    if (!isAdminPassword(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Try dynamic conferences, fall back to hardcoded
    let tabs = FALLBACK_TABS;
    try {
      tabs = await getConferenceTabs();
    } catch {
      // Use fallback
    }

    const tab = tabs.find((t) => t.name === conference);
    if (!tab) {
      return NextResponse.json({ error: 'Invalid conference' }, { status: 400 });
    }

    const sheetName = await getSheetTitle(tab.gid);

    // Read columns A:M to find the event row
    const rows = await readRange(sheetName, 'A1:M');

    // Find header row (col B = "Start Time")
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i]?.[1] || '').trim().toLowerCase() === 'start time') {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      return NextResponse.json({ error: 'Could not find header row' }, { status: 500 });
    }

    // Find the row with matching event name (column E = index 4)
    let matchedRow = -1;
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const name = (rows[i]?.[4] || '').trim();
      if (name === eventName.trim()) {
        matchedRow = i + 1; // Convert to 1-based sheet row
        break;
      }
    }

    if (matchedRow === -1) {
      return NextResponse.json({ error: `Event not found: ${eventName}` }, { status: 404 });
    }

    // Write to column M of the matched row
    await writeCell(sheetName, `M${matchedRow}`, featured ? 'TRUE' : 'FALSE');

    return NextResponse.json({ success: true, row: matchedRow, featured });
  } catch (err) {
    console.error('Toggle featured error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
