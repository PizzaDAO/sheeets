import crypto from 'crypto';
import { SHEET_ID } from '@/lib/constants';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Base64url encode (no padding) */
function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Create a signed JWT for Google service account auth */
function createJWT(): string {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim().replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY env vars');
  }

  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: email,
      scope: SCOPES,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );

  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);

  return `${signingInput}.${base64url(signature)}`;
}

/** Get a valid access token, using cache when possible (~55 min TTL) */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const jwt = createJWT();

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get access token: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    // Cache for 55 minutes (token is valid for 60)
    expiresAt: Date.now() + 55 * 60 * 1000,
  };

  return cachedToken.token;
}

// Cache for sheet titles by gid
const sheetTitleCache = new Map<number, { title: string; expiresAt: number }>();

/** Resolve a sheet tab's actual title from its gid (numeric sheet ID). */
export async function getSheetTitle(gid: number): Promise<string> {
  const cached = sheetTitleCache.get(gid);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.title;
  }

  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch sheet metadata: ${res.status} ${text}`);
  }

  const data = await res.json();
  const sheets: { properties: { sheetId: number; title: string } }[] = data.sheets || [];

  // Cache all sheets from this response
  for (const s of sheets) {
    sheetTitleCache.set(s.properties.sheetId, {
      title: s.properties.title,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
  }

  const match = sheets.find((s) => s.properties.sheetId === gid);
  if (!match) {
    throw new Error(`No sheet found with gid ${gid}`);
  }

  return match.properties.title;
}

/**
 * Find the next empty row in the "Add Events Here" section of a sheet tab.
 * Scans column A for the cell containing "Add Events Here", then looks for
 * the header row below it (col B = "Start Time"), and returns the first
 * empty row after that header.
 */
export async function findNextEmptyRow(sheetName: string): Promise<number> {
  const token = await getAccessToken();
  const range = encodeURIComponent(`'${sheetName}'!A1:E`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to read sheet: ${res.status} ${text}`);
  }

  const data = await res.json();
  const rows: string[][] = data.values || [];

  // Find the "Add Events Here" marker row
  let addEventsRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const cellA = (rows[i]?.[0] || '').trim();
    if (cellA.includes('Add Events Here')) {
      addEventsRow = i;
      break;
    }
  }

  // Find the header row after the marker (col B = "Start Time")
  let headerRow = addEventsRow >= 0 ? addEventsRow + 1 : -1;
  if (addEventsRow >= 0) {
    for (let i = addEventsRow + 1; i < rows.length; i++) {
      const colB = (rows[i]?.[1] || '').trim().toLowerCase();
      if (colB === 'start time') {
        headerRow = i;
        break;
      }
    }
  }

  // Start scanning for empty rows after the header
  const startIdx = headerRow >= 0 ? headerRow + 1 : 13; // fallback to row 14

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i] || [];
    const cellDate = (row[0] || '').trim();
    const startTime = (row[1] || '').trim();
    const name = (row[4] || '').trim();

    if (!cellDate && !startTime && !name) {
      return i + 1; // Convert to 1-based sheet row
    }
  }

  // If no empty row found, append after last row
  return rows.length + 1;
}

/** Read a range from a sheet tab. Returns a 2D array of strings. */
export async function readRange(sheetName: string, range: string): Promise<string[][]> {
  const token = await getAccessToken();
  const fullRange = encodeURIComponent(`'${sheetName}'!${range}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${fullRange}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to read sheet: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.values || [];
}

/** Write a single value to a specific cell. */
export async function writeCell(sheetName: string, cell: string, value: string): Promise<void> {
  const token = await getAccessToken();
  const range = encodeURIComponent(`'${sheetName}'!${cell}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [[value]] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to write cell: ${res.status} ${text}`);
  }
}

export interface EventRow {
  date: string;
  startTime: string;
  endTime: string;
  organizer: string;
  name: string;
  address: string;
  cost: string;
  tags: string;
  link: string;
  food: boolean;
  bar: boolean;
  note: string;
}

/**
 * Neutralize spreadsheet formula injection in user-supplied text.
 *
 * Event rows are written with valueInputOption=USER_ENTERED (not RAW) on
 * purpose: the sheet relies on Sheets parsing "Mar 21" / "6:00 PM" into real
 * date/time values (gviz reads typed columns) and "TRUE"/"FALSE" into checkbox
 * booleans for Food/Bar. RAW would store those as plain strings and break
 * parsing, so instead any value that would be interpreted as a formula is
 * prefixed with an apostrophe, which Sheets treats as "literal text" and hides.
 */
export function escapeSheetValue(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Build the A:L cell values for an event row (user text escaped). */
function eventRowValues(event: EventRow): string[] {
  return [
    escapeSheetValue(event.date),
    escapeSheetValue(event.startTime),
    escapeSheetValue(event.endTime),
    escapeSheetValue(event.organizer),
    escapeSheetValue(event.name),
    escapeSheetValue(event.address),
    escapeSheetValue(event.cost),
    escapeSheetValue(event.tags),
    escapeSheetValue(event.link),
    event.food ? 'TRUE' : 'FALSE',
    event.bar ? 'TRUE' : 'FALSE',
    escapeSheetValue(event.note),
  ];
}

/**
 * Write an event row to the sheet.
 * Columns A:L map to: Date, Start Time, End Time, Organizer, Event Name, Address, Cost, Tags, Link, Food, Bar, Note
 * Returns the row number written.
 */
export async function appendEventRow(sheetName: string, event: EventRow): Promise<number> {
  const row = await findNextEmptyRow(sheetName);
  const token = await getAccessToken();

  const range = encodeURIComponent(`'${sheetName}'!A${row}:L${row}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`;

  const values = [eventRowValues(event)];

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to write to sheet: ${res.status} ${text}`);
  }

  return row;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse a sheet date like "May 5", "Tue, May 5" → sortable number (month*100+day). */
function parseSheetDate(raw: string): number | null {
  const match = raw.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})\b/i);
  if (!match) return null;
  const month = MONTH_MAP[match[1].toLowerCase().slice(0, 3)];
  const day = parseInt(match[2], 10);
  if (month === undefined || isNaN(day)) return null;
  return month * 100 + day;
}

/** Parse a sheet time like "12:00p", "6:00 PM", "9:30 AM" → minutes since midnight. */
function parseSheetTime(raw: string): number | null {
  const match = raw.match(/(\d{1,2}):(\d{2})\s*(am|pm|a|p)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3]?.toLowerCase();
  if (ampm) {
    if (ampm.startsWith('p') && hours !== 12) hours += 12;
    if (ampm.startsWith('a') && hours === 12) hours = 0;
  }
  return hours * 60 + minutes;
}

/**
 * Insert an event row into the main section of a sheet tab (before the "Add Events Here" area).
 * Uses the Sheets batchUpdate API to insert a blank row, then writes the event data.
 * Inserts at the chronologically correct position by date/time.
 * Returns the 1-based row number where the event was inserted.
 */
export async function insertEventRowSorted(sheetName: string, gid: number, event: EventRow): Promise<number> {
  const token = await getAccessToken();

  // 1. Read columns A:B to find the main section boundaries
  const range = encodeURIComponent(`'${sheetName}'!A1:E`);
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;
  const readRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!readRes.ok) {
    const text = await readRes.text();
    throw new Error(`Failed to read sheet: ${readRes.status} ${text}`);
  }
  const readData = await readRes.json();
  const rows: string[][] = readData.values || [];

  // 2. Find the first header row (col B = "Start Time") — this is the main section header
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const colB = (rows[i]?.[1] || '').trim().toLowerCase();
    if (colB === 'start time') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    // Can't find main section header — fall back to appendEventRow
    return appendEventRow(sheetName, event);
  }

  // 3. Find the end of the main events section:
  //    first empty row or "Add Events Here" marker after the header
  let mainSectionEnd = rows.length;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cellA = (rows[i]?.[0] || '').trim();
    const cellB = (rows[i]?.[1] || '').trim();
    const cellE = (rows[i]?.[4] || '').trim();

    // "Add Events Here" marker — stop before it
    if (cellA.includes('Add Events Here')) {
      mainSectionEnd = i;
      break;
    }

    // Empty row (no date, no start time, no name) — end of main section
    if (!cellA && !cellB && !cellE) {
      mainSectionEnd = i;
      break;
    }
  }

  // Find chronologically correct insertion point
  const newDate = parseSheetDate(event.date);
  const newTime = parseSheetTime(event.startTime);

  let insertIdx = mainSectionEnd; // default: end of section
  if (newDate !== null) {
    for (let i = headerIdx + 1; i < mainSectionEnd; i++) {
      const rowDate = parseSheetDate((rows[i]?.[0] || '').trim());
      if (rowDate === null) continue;

      if (rowDate > newDate) {
        insertIdx = i;
        break;
      }
      if (rowDate === newDate) {
        const rowTime = parseSheetTime((rows[i]?.[1] || '').trim());
        if (rowTime !== null && newTime !== null && rowTime > newTime) {
          insertIdx = i;
          break;
        }
      }
    }
  }
  const insertRow = insertIdx + 1; // 1-based sheet row

  // 4. Insert a blank row using batchUpdate API
  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`;
  const insertRes = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        insertDimension: {
          range: {
            sheetId: gid,
            dimension: 'ROWS',
            startIndex: insertIdx,
            endIndex: insertIdx + 1,
          },
          inheritFromBefore: true,
        },
      }],
    }),
  });

  if (!insertRes.ok) {
    const text = await insertRes.text();
    throw new Error(`Failed to insert row: ${insertRes.status} ${text}`);
  }

  // 5. Write event data to the newly inserted row
  const writeRange = encodeURIComponent(`'${sheetName}'!A${insertRow}:L${insertRow}`);
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${writeRange}?valueInputOption=USER_ENTERED`;

  const values = [eventRowValues(event)];

  const writeRes = await fetch(writeUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!writeRes.ok) {
    const text = await writeRes.text();
    throw new Error(`Failed to write event data: ${writeRes.status} ${text}`);
  }

  return insertRow;
}

/**
 * Find a submitted event row in the review section (below "Add Events Here").
 * Searches by event name (col E, 0-indexed 4) and date (col A, 0-indexed 0).
 * Returns the 0-based row index, or null if not found.
 */
export async function findReviewRow(
  sheetName: string,
  eventName: string,
  eventDate: string
): Promise<number | null> {
  const token = await getAccessToken();
  const range = encodeURIComponent(`'${sheetName}'!A1:M`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to read sheet: ${res.status} ${text}`);
  }

  const data = await res.json();
  const rows: string[][] = data.values || [];

  // Find the "Add Events Here" marker
  let addEventsRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const cellA = (rows[i]?.[0] || '').trim();
    if (cellA.includes('Add Events Here')) {
      addEventsRow = i;
      break;
    }
  }

  if (addEventsRow === -1) return null;

  // Find the review header row (col B = "Start Time") after the marker
  let headerRow = -1;
  for (let i = addEventsRow + 1; i < rows.length; i++) {
    const colB = (rows[i]?.[1] || '').trim().toLowerCase();
    if (colB === 'start time') {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) return null;

  // Scan review rows for matching name + date (case-insensitive)
  const targetName = eventName.trim().toLowerCase();
  const targetDate = eventDate.trim().toLowerCase();

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const cellDate = (row[0] || '').trim().toLowerCase();
    const cellName = (row[4] || '').trim().toLowerCase();

    // Skip empty rows
    if (!cellDate && !cellName) continue;

    if (cellName === targetName && cellDate === targetDate) {
      return i; // 0-based row index
    }
  }

  return null;
}

/**
 * Delete a single row from a sheet by 0-based row index.
 * Uses the Sheets batchUpdate API with deleteDimension.
 */
export async function deleteSheetRow(gid: number, rowIndex: number): Promise<void> {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId: gid,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete row: ${res.status} ${text}`);
  }
}
