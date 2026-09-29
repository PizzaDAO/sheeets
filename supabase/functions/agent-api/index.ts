import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Constants ----------------------------------------------------------------

const SHEET_ID = "1xWmIHyEyOmPHfkYuZkucPRlLGWbb9CF6Oqvfl8FUV6k";
const EVENT_TABS = [
  { gid: 356217373, name: "ETH Denver 2026" },
  { gid: 377806756, name: "Consensus Hong Kong 2026" },
];

const TAG_ALIASES: Record<string, string> = {
  "Fitness/Wellness": "Wellness",
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// --- CORS ---------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, apikey, x-client-info",
};

function corsResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorResponse(message: string, status = 400) {
  return corsResponse({ error: message }, status);
}

// --- Supabase Admin Client ----------------------------------------------------

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
  return createClient(url, serviceKey);
}

// --- GViz Parser (ported from src/lib/gviz.ts) --------------------------------

interface GVizCell {
  v: string | number | boolean | null;
  f?: string;
}

interface GVizRow {
  c: (GVizCell | null)[];
}

interface GVizTable {
  cols: { id: string; label: string; type: string }[];
  rows: GVizRow[];
}

function parseGVizResponse(response: string): GVizTable {
  let jsonStr = response;
  if (jsonStr.startsWith("/*")) {
    const commentEnd = jsonStr.indexOf("*/");
    if (commentEnd !== -1) jsonStr = jsonStr.substring(commentEnd + 2).trim();
  }
  const fn = "google.visualization.Query.setResponse(";
  if (jsonStr.startsWith(fn)) {
    jsonStr = jsonStr.substring(fn.length);
  }
  if (jsonStr.endsWith(");")) jsonStr = jsonStr.slice(0, -2);
  else if (jsonStr.endsWith(")")) jsonStr = jsonStr.slice(0, -1);
  const parsed = JSON.parse(jsonStr);
  if (parsed.status !== "ok") {
    throw new Error(`GViz query failed: ${parsed.status}`);
  }
  return parsed.table;
}

function getCellValue(cell: GVizCell | null): string {
  if (!cell) return "";
  if (cell.f !== undefined && cell.f !== null) return String(cell.f);
  if (cell.v !== undefined && cell.v !== null) return String(cell.v);
  return "";
}

function getCellBool(cell: GVizCell | null): boolean {
  if (!cell || !cell.v) return false;
  const val = String(cell.v).toLowerCase().trim();
  return ["true", "yes", "1", "y", "x", "\u2713", "\u2714"].includes(val);
}

// --- Event Parsing (ported from src/lib/fetch-events.ts) ----------------------

interface CachedEvent {
  id: string;
  conference: string;
  date_iso: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  organizer: string;
  name: string;
  address: string;
  cost: string;
  is_free: boolean;
  tags: string[];
  link: string;
  has_food: boolean;
  has_bar: boolean;
  note: string;
  lat: number | null;
  lng: number | null;
  cached_at?: string;
}

function parseDateToISO(dateStr: string): string {
  if (!dateStr) return "";
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const match = dateStr.match(/(\w+)\s+(\d+)/);
  if (!match) return "";
  const month =
    months[match[1]] || months[dateStr.split(",")[1]?.trim().split(" ")[0]];
  if (!month) return "";
  const day = match[2].padStart(2, "0");
  return `2026-${month}-${day}`;
}

function isFreeEvent(cost: string): boolean {
  if (!cost) return true;
  const lower = cost.toLowerCase().trim();
  return lower === "free" || lower === "" || lower === "0" || lower === "$0";
}

function parseTags(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => TAG_ALIASES[t] || t);
}

function generateEventId(
  conference: string,
  date: string,
  startTime: string,
  name: string,
): string {
  const input = `${conference}|${date}|${startTime}|${name}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const positiveHash = (hash >>> 0).toString(36);
  return `evt-${positiveHash}`;
}

function findHeaderIndex(rows: GVizRow[]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.c) continue;
    const colB = getCellValue(row.c[1]).toLowerCase().trim();
    if (colB === "start time") return i;
  }
  return -1;
}

function isEmptyRow(row: GVizRow): boolean {
  if (!row.c) return true;
  const name = getCellValue(row.c[4]);
  const date = getCellValue(row.c[0]);
  const startTime = getCellValue(row.c[1]);
  return !name && !date && !startTime;
}

async function fetchPage(gid: number, offset: number): Promise<string> {
  const tq = encodeURIComponent(`select * limit 500 offset ${offset}`);
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}&headers=1&tq=${tq}`;
  const response = await fetch(url);
  return response.text();
}

async function fetchEventsFromSheets(): Promise<CachedEvent[]> {
  const events: CachedEvent[] = [];
  const seenIds = new Map<string, number>();

  for (const tab of EVENT_TABS) {
    let allRows: GVizRow[] = [];
    for (let offset = 0; offset < 5000; offset += 500) {
      const text = await fetchPage(tab.gid, offset);
      const table = parseGVizResponse(text);
      if (table.rows.length === 0) break;
      allRows = allRows.concat(table.rows);
      if (table.rows.length < 500) break;
    }

    const headerIdx = findHeaderIndex(allRows);
    if (headerIdx === -1) continue;

    let currentDate = "";

    for (let i = headerIdx + 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (isEmptyRow(row)) break;

      const dateVal = getCellValue(row.c[0]);
      if (dateVal) currentDate = dateVal;

      const name = getCellValue(row.c[4]);
      if (!name) continue;

      const startTime = getCellValue(row.c[1]);
      const endTime = getCellValue(row.c[2]);
      const cost = getCellValue(row.c[6]);
      const isAllDay =
        !startTime || startTime.toLowerCase().includes("all day");

      const rawTags = parseTags(getCellValue(row.c[7]));
      const costVal = getCellValue(row.c[6]);
      const foodBool = getCellBool(row.c[9]);
      const barBool = getCellBool(row.c[10]);

      const syntheticTags: string[] = [];
      if (!isFreeEvent(costVal)) syntheticTags.push("$$");
      if (foodBool) syntheticTags.push("\ud83c\udf55 Food");
      if (barBool) syntheticTags.push("\ud83c\udf7a Bar");
      const tags = [...rawTags, ...syntheticTags];

      let id = generateEventId(tab.name, currentDate, startTime, name);
      const count = seenIds.get(id) ?? 0;
      seenIds.set(id, count + 1);
      if (count > 0) id = `${id}-${count}`;

      events.push({
        id,
        conference: tab.name,
        date_iso: parseDateToISO(currentDate),
        start_time: isAllDay ? "All Day" : startTime,
        end_time: endTime || "",
        is_all_day: isAllDay,
        organizer: getCellValue(row.c[3]),
        name,
        address: getCellValue(row.c[5]),
        cost,
        is_free: isFreeEvent(cost),
        tags,
        link: getCellValue(row.c[8]),
        has_food: foodBool,
        has_bar: barBool,
        note: getCellValue(row.c[11]),
        lat: null,
        lng: null,
      });
    }
  }

  return events;
}

// --- Events Cache Layer -------------------------------------------------------

async function getEvents(): Promise<CachedEvent[]> {
  const admin = getAdminClient();

  // Check if cache is fresh (any row with cached_at within TTL)
  const { data: sample } = await admin
    .from("events_cache")
    .select("cached_at")
    .order("cached_at", { ascending: false })
    .limit(1)
    .single();

  const now = Date.now();
  const cacheAge = sample
    ? now - new Date(sample.cached_at).getTime()
    : Infinity;

  if (cacheAge < CACHE_TTL_MS) {
    // Serve from cache
    const { data, error } = await admin
      .from("events_cache")
      .select("*")
      .order("date_iso", { ascending: true });
    if (error) throw new Error(`Cache read failed: ${error.message}`);
    return data as CachedEvent[];
  }

  // Cache is stale or empty -- refresh from Google Sheets
  const events = await fetchEventsFromSheets();

  // Upsert all events into cache
  const cachedAt = new Date().toISOString();
  const rows = events.map((e) => ({ ...e, cached_at: cachedAt }));

  if (rows.length > 0) {
    // Clear old cache and insert fresh data
    await admin.from("events_cache").delete().neq("id", "");

    // Insert in batches of 500
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await admin
        .from("events_cache")
        .upsert(batch, { onConflict: "id" });
      if (error) {
        console.error(`Cache upsert batch ${i} failed:`, error.message);
      }
    }
  }

  return events;
}

// --- "Now" filter helper (ported from src/lib/filters.ts) ---------------------

function parseTimeToMinutes(t: string): number | null {
  if (!t) return null;
  const s = t.toLowerCase().trim();
  if (s === "all day" || s === "tbd") return null;
  const m = s.match(/(\d{1,2}):?(\d{2})?\s*(am?|pm?)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2] ? parseInt(m[2]) : 0;
  const isPM = m[3] && m[3].startsWith("p");
  const isAM = m[3] && m[3].startsWith("a");
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + min;
}

function passesNowFilter(event: CachedEvent, now: Date): boolean {
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (event.date_iso !== todayISO) return false;
  if (event.is_all_day) return true;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(event.start_time);
  if (startMinutes === null) return true;
  const endMinutes = parseTimeToMinutes(event.end_time);

  if (startMinutes <= nowMinutes) {
    if (endMinutes === null) return nowMinutes <= startMinutes + 120;
    if (endMinutes >= nowMinutes) return true;
    return false;
  }
  if (startMinutes > nowMinutes && startMinutes <= nowMinutes + 60) return true;
  return false;
}

// --- Event Filtering ----------------------------------------------------------

function filterEvents(
  events: CachedEvent[],
  params: URLSearchParams,
): CachedEvent[] {
  let filtered = events;

  const conference = params.get("conference");
  if (conference) {
    filtered = filtered.filter(
      (e) => e.conference.toLowerCase() === conference.toLowerCase(),
    );
  }

  const date = params.get("date");
  if (date) {
    filtered = filtered.filter((e) => e.date_iso === date);
  }

  const tags = params.get("tags");
  if (tags) {
    const tagList = tags
      .split(",")
      .map((t) => t.trim().toLowerCase());
    filtered = filtered.filter((e) =>
      tagList.every((tag) => e.tags.some((et) => et.toLowerCase() === tag)),
    );
  }

  const search = params.get("search");
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((e) => {
      const searchable = [
        e.name,
        e.organizer,
        e.address,
        e.note,
        e.conference,
        ...e.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(q);
    });
  }

  const free = params.get("free");
  if (free === "true") {
    filtered = filtered.filter((e) => e.is_free);
  }

  const nowParam = params.get("now");
  if (nowParam === "true") {
    const now = new Date();
    filtered = filtered.filter((e) => passesNowFilter(e, now));
  }

  return filtered;
}

// --- Response Formatters ------------------------------------------------------

function formatEvent(e: CachedEvent) {
  return {
    id: e.id,
    conference: e.conference,
    dateISO: e.date_iso,
    startTime: e.start_time,
    endTime: e.end_time,
    isAllDay: e.is_all_day,
    organizer: e.organizer,
    name: e.name,
    address: e.address,
    cost: e.cost,
    isFree: e.is_free,
    tags: e.tags,
    link: e.link,
    hasFood: e.has_food,
    hasBar: e.has_bar,
    note: e.note,
    lat: e.lat,
    lng: e.lng,
  };
}

// --- Auth Module: JWT Auth (for key management from web app) -----------------

interface JwtAuthResult {
  userId: string;
}

async function authenticateJwt(
  req: Request,
): Promise<JwtAuthResult | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse(
      "Missing or invalid token. Expected: Authorization: Bearer <jwt>",
      401,
    );
  }

  const token = authHeader.replace("Bearer ", "");

  // JWT tokens should NOT start with shts_ (those are API keys)
  if (token.startsWith("shts_")) {
    return errorResponse(
      "API keys cannot be used for key management. Use a Supabase JWT.",
      401,
    );
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

  if (error || !user) {
    return errorResponse("Invalid or expired JWT", 401);
  }

  return { userId: user.id };
}

// --- Auth Module: API Key Auth (for authenticated API endpoints) -------------

interface ApiKeyAuthResult {
  userId: string;
  scopes: string[];
}

async function authenticateApiKey(
  req: Request,
): Promise<ApiKeyAuthResult | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer shts_")) {
    return errorResponse(
      "Missing or invalid API key. Expected: Authorization: Bearer shts_...",
      401,
    );
  }

  const apiKey = authHeader.replace("Bearer ", "");

  // SHA-256 hash the key
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(apiKey),
  );
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const admin = getAdminClient();

  // Look up key
  const { data: keyRecord, error } = await admin
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (error || !keyRecord) {
    return errorResponse("Invalid API key", 401);
  }

  // Check if expired
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return errorResponse("API key has expired", 401);
  }

  // Check rate limit
  const { data: allowed } = await admin.rpc("check_rate_limit", {
    p_key_hash: keyHash,
  });
  if (!allowed) {
    return errorResponse(
      "Rate limit exceeded. Max 60 requests per minute.",
      429,
    );
  }

  // Update last_used_at (fire and forget)
  admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id)
    .then(() => {});

  return {
    userId: keyRecord.user_id,
    scopes: keyRecord.scopes,
  };
}

function hasScope(auth: ApiKeyAuthResult, scope: string): boolean {
  return auth.scopes.includes(scope);
}

// --- Auth Helpers -------------------------------------------------------------

const VALID_SCOPES = [
  "itinerary:read",
  "itinerary:write",
  "friends:read",
  "rsvps:read",
  "rsvps:write",
  "recommendations:read",
];

const DEFAULT_SCOPES = [...VALID_SCOPES];

const MAX_KEYS_PER_USER = 5;

async function sha256Hex(input: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `shts_${hex}`;
}

// --- HTML Docs Generator -----------------------------------------------------

function generateDocsHtml(): string {
  const BASE_URL = "https://qsiukfwuwbpwyujfahtz.supabase.co/functions/v1/agent-api";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>sheeets Agent API</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    line-height: 1.6;
    padding: 0;
  }
  .container { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1 { color: #fff; font-size: 2.25rem; margin-bottom: 0.5rem; }
  h1 span { color: #38bdf8; }
  .subtitle { color: #94a3b8; font-size: 1.1rem; margin-bottom: 2rem; }
  .base-url-box {
    background: #1e293b; border: 1px solid #334155; border-radius: 8px;
    padding: 1rem 1.25rem; margin-bottom: 2.5rem; display: flex;
    align-items: center; gap: 0.75rem; flex-wrap: wrap;
  }
  .base-url-label { color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .base-url-value { color: #38bdf8; font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.95rem; word-break: break-all; }
  h2 { color: #fff; font-size: 1.5rem; margin: 2.5rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #1e293b; }
  h3 { color: #f1f5f9; font-size: 1.15rem; margin: 1.75rem 0 0.75rem; }
  .section { margin-bottom: 2rem; }
  .endpoint-group { margin-bottom: 2rem; }
  .endpoint-group-title { color: #cbd5e1; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-bottom: 0.75rem; }
  .endpoint {
    background: #1e293b; border: 1px solid #334155; border-radius: 8px;
    padding: 0.85rem 1rem; margin-bottom: 0.5rem; display: flex;
    align-items: flex-start; gap: 0.75rem; flex-wrap: wrap;
  }
  .method {
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
    font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.5rem;
    border-radius: 4px; flex-shrink: 0; min-width: 56px; text-align: center;
  }
  .method-get { background: #065f46; color: #6ee7b7; }
  .method-post { background: #1e3a5f; color: #93c5fd; }
  .method-delete { background: #7f1d1d; color: #fca5a5; }
  .method-put { background: #713f12; color: #fde68a; }
  .endpoint-path {
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
    color: #f1f5f9; font-size: 0.9rem; min-width: 200px;
  }
  .endpoint-desc { color: #94a3b8; font-size: 0.9rem; flex: 1; }
  .endpoint-desc code {
    background: #334155; color: #fbbf24; padding: 0.1rem 0.35rem;
    border-radius: 3px; font-size: 0.8rem;
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
  }
  .endpoint-params { color: #64748b; font-size: 0.8rem; font-family: 'SF Mono', SFMono-Regular, Consolas, monospace; margin-top: 0.25rem; }
  .auth-badge {
    font-size: 0.7rem; padding: 0.15rem 0.45rem; border-radius: 3px;
    font-weight: 600; flex-shrink: 0;
  }
  .auth-public { background: #14532d; color: #86efac; }
  .auth-apikey { background: #4c1d95; color: #c4b5fd; }
  .auth-jwt { background: #78350f; color: #fde68a; }
  .scope-tag { color: #a78bfa; font-size: 0.75rem; font-family: 'SF Mono', SFMono-Regular, Consolas, monospace; }

  .info-box {
    background: #1e293b; border: 1px solid #334155; border-radius: 8px;
    padding: 1.25rem; margin-bottom: 1rem;
  }
  .info-box p { margin-bottom: 0.5rem; }
  .info-box p:last-child { margin-bottom: 0; }
  .info-box code {
    background: #334155; color: #fbbf24; padding: 0.15rem 0.4rem;
    border-radius: 3px; font-size: 0.85rem;
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
  }
  .info-box a { color: #38bdf8; text-decoration: none; }
  .info-box a:hover { text-decoration: underline; }
  .info-box ul { list-style: none; padding-left: 0; }
  .info-box li { padding: 0.25rem 0; }
  .info-box li::before { content: "\\2022"; color: #64748b; margin-right: 0.5rem; }

  table {
    width: 100%; border-collapse: collapse; margin: 1rem 0;
    background: #1e293b; border-radius: 8px; overflow: hidden;
    border: 1px solid #334155;
  }
  th { background: #0f172a; color: #94a3b8; text-align: left; padding: 0.6rem 1rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  td { padding: 0.6rem 1rem; border-top: 1px solid #334155; font-size: 0.9rem; }
  td code {
    background: #334155; color: #a78bfa; padding: 0.1rem 0.35rem;
    border-radius: 3px; font-size: 0.8rem;
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
  }

  .example {
    background: #1e293b; border: 1px solid #334155; border-radius: 8px;
    padding: 1rem 1.25rem; margin: 1rem 0; overflow-x: auto;
  }
  .example-label { color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; font-weight: 600; }
  .example pre {
    color: #a5f3fc; font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
    font-size: 0.85rem; white-space: pre-wrap; word-break: break-all; line-height: 1.5;
  }
  .example .comment { color: #64748b; }
  .example .string { color: #86efac; }
  .example .flag { color: #fbbf24; }

  .footer {
    margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #1e293b;
    text-align: center; color: #475569; font-size: 0.85rem;
  }
  .footer a { color: #38bdf8; text-decoration: none; }
  .footer a:hover { text-decoration: underline; }

  @media (max-width: 640px) {
    .container { padding: 1.25rem 1rem; }
    h1 { font-size: 1.75rem; }
    .endpoint { flex-direction: column; gap: 0.4rem; }
    .endpoint-path { min-width: auto; }
  }
</style>
</head>
<body>
<div class="container">

<h1><span>sheeets</span> Agent API</h1>
<p class="subtitle">REST API for AI agents to interact with sheeets &mdash; crypto event discovery for conferences like ETH Denver, Consensus, and more.</p>

<div class="base-url-box">
  <span class="base-url-label">Base URL</span>
  <span class="base-url-value">${BASE_URL}</span>
</div>

<!-- ============================================================ -->
<h2>Endpoints</h2>

<!-- Events -->
<div class="endpoint-group">
  <div class="endpoint-group-title">Events <span class="auth-badge auth-public">Public</span></div>

  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/events</span>
    <span class="endpoint-desc">
      Search and filter events
      <div class="endpoint-params">?conference= &amp; ?date= &amp; ?tags= &amp; ?search= &amp; ?free=true &amp; ?now=true</div>
    </span>
  </div>
  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/events/:id</span>
    <span class="endpoint-desc">Get a single event by ID</span>
  </div>
  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/events/conferences</span>
    <span class="endpoint-desc">List all conferences with event counts</span>
  </div>
  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/events/tags</span>
    <span class="endpoint-desc">List all unique tags with counts</span>
  </div>
  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/events/dates</span>
    <span class="endpoint-desc">List event dates with counts</span>
  </div>
</div>

<!-- Itinerary -->
<div class="endpoint-group">
  <div class="endpoint-group-title">Itinerary <span class="auth-badge auth-apikey">API Key</span> <span class="scope-tag">itinerary:read / itinerary:write</span></div>

  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/itinerary</span>
    <span class="endpoint-desc">Get the user's saved events</span>
  </div>
  <div class="endpoint">
    <span class="method method-post">POST</span>
    <span class="endpoint-path">/itinerary/add</span>
    <span class="endpoint-desc">Add events to itinerary <code>{ "eventIds": ["..."] }</code></span>
  </div>
  <div class="endpoint">
    <span class="method method-post">POST</span>
    <span class="endpoint-path">/itinerary/remove</span>
    <span class="endpoint-desc">Remove events from itinerary <code>{ "eventIds": ["..."] }</code></span>
  </div>
  <div class="endpoint">
    <span class="method method-delete">DELETE</span>
    <span class="endpoint-path">/itinerary</span>
    <span class="endpoint-desc">Clear all saved events</span>
  </div>
  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/itinerary/conflicts</span>
    <span class="endpoint-desc">Detect scheduling conflicts in itinerary</span>
  </div>
  <div class="endpoint">
    <span class="method method-post">POST</span>
    <span class="endpoint-path">/itinerary/share</span>
    <span class="endpoint-desc">Create a shareable itinerary link</span>
  </div>
  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/itinerary/export</span>
    <span class="endpoint-desc">Export itinerary as JSON</span>
  </div>
</div>

<!-- Friends -->
<div class="endpoint-group">
  <div class="endpoint-group-title">Friends <span class="auth-badge auth-apikey">API Key</span> <span class="scope-tag">friends:read</span></div>

  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/friends</span>
    <span class="endpoint-desc">List your friends</span>
  </div>
  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/friends/going</span>
    <span class="endpoint-desc">See which friends are going to events <code>?eventId=</code></span>
  </div>
</div>

<!-- RSVPs -->
<div class="endpoint-group">
  <div class="endpoint-group-title">RSVPs <span class="auth-badge auth-apikey">API Key</span> <span class="scope-tag">rsvps:read / rsvps:write</span></div>

  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/rsvps</span>
    <span class="endpoint-desc">List your RSVPs</span>
  </div>
  <div class="endpoint">
    <span class="method method-post">POST</span>
    <span class="endpoint-path">/rsvps</span>
    <span class="endpoint-desc">Create an RSVP <code>{ "eventId": "..." }</code></span>
  </div>
</div>

<!-- Recommendations -->
<div class="endpoint-group">
  <div class="endpoint-group-title">Recommendations <span class="auth-badge auth-apikey">API Key</span> <span class="scope-tag">recommendations:read</span></div>

  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/recommendations</span>
    <span class="endpoint-desc">Get personalized event suggestions based on your itinerary and preferences</span>
  </div>
</div>

<!-- API Keys -->
<div class="endpoint-group">
  <div class="endpoint-group-title">API Keys <span class="auth-badge auth-jwt">JWT Auth</span></div>

  <div class="endpoint">
    <span class="method method-post">POST</span>
    <span class="endpoint-path">/keys</span>
    <span class="endpoint-desc">Create an API key <code>{ "name?": "...", "scopes?": [...] }</code></span>
  </div>
  <div class="endpoint">
    <span class="method method-get">GET</span>
    <span class="endpoint-path">/keys</span>
    <span class="endpoint-desc">List your API keys (key values redacted)</span>
  </div>
  <div class="endpoint">
    <span class="method method-delete">DELETE</span>
    <span class="endpoint-path">/keys/:id</span>
    <span class="endpoint-desc">Revoke an API key</span>
  </div>
</div>

<!-- ============================================================ -->
<h2>Authentication</h2>

<div class="info-box">
  <p><strong>Public endpoints</strong> (Events) require no authentication.</p>
  <p><strong>Authenticated endpoints</strong> (Itinerary, Friends, RSVPs, Recommendations) use an API key:</p>
  <p><code>Authorization: Bearer shts_...</code></p>
  <p><strong>Key management endpoints</strong> use a Supabase JWT from the web app:</p>
  <p><code>Authorization: Bearer &lt;supabase-jwt&gt;</code></p>
  <p style="margin-top: 0.75rem; color: #94a3b8;">Get your API key at <a href="https://sheeets.xyz">sheeets.xyz</a> (coming soon)</p>
</div>

<!-- ============================================================ -->
<h2>Rate Limits</h2>

<div class="info-box">
  <ul>
    <li><strong>60 requests per minute</strong> per API key</li>
    <li><strong>1,000 requests per day</strong> per API key</li>
  </ul>
  <p style="margin-top: 0.5rem; color: #94a3b8;">Public event endpoints are not rate-limited but are cached for 15 minutes.</p>
</div>

<!-- ============================================================ -->
<h2>Scopes</h2>

<table>
  <thead>
    <tr><th>Scope</th><th>Access</th></tr>
  </thead>
  <tbody>
    <tr><td><code>itinerary:read</code></td><td>Read your saved itinerary, detect conflicts, export</td></tr>
    <tr><td><code>itinerary:write</code></td><td>Add/remove events, clear itinerary</td></tr>
    <tr><td><code>friends:read</code></td><td>List friends, see friends' itineraries</td></tr>
    <tr><td><code>rsvps:read</code></td><td>List your RSVPs</td></tr>
    <tr><td><code>rsvps:write</code></td><td>Create new RSVPs</td></tr>
    <tr><td><code>recommendations:read</code></td><td>Get personalized event recommendations</td></tr>
  </tbody>
</table>

<!-- ============================================================ -->
<h2>Examples</h2>

<div class="example">
  <div class="example-label">Search events</div>
  <pre><span class="flag">curl</span> <span class="string">"${BASE_URL}/events?search=pizza&amp;free=true"</span></pre>
</div>

<div class="example">
  <div class="example-label">Get a single event</div>
  <pre><span class="flag">curl</span> <span class="string">"${BASE_URL}/events/evt-abc123"</span></pre>
</div>

<div class="example">
  <div class="example-label">List conferences</div>
  <pre><span class="flag">curl</span> <span class="string">"${BASE_URL}/events/conferences"</span></pre>
</div>

<div class="example">
  <div class="example-label">Filter by conference and date</div>
  <pre><span class="flag">curl</span> <span class="string">"${BASE_URL}/events?conference=ETH+Denver+2026&amp;date=2026-02-25"</span></pre>
</div>

<div class="example">
  <div class="example-label">Filter by tags</div>
  <pre><span class="flag">curl</span> <span class="string">"${BASE_URL}/events?tags=AI,DeFi"</span></pre>
</div>

<div class="example">
  <div class="example-label">Events happening now</div>
  <pre><span class="flag">curl</span> <span class="string">"${BASE_URL}/events?now=true"</span></pre>
</div>

<div class="example">
  <div class="example-label">Authenticated request (API key)</div>
  <pre><span class="flag">curl</span> <span class="flag">-H</span> <span class="string">"Authorization: Bearer shts_your_key_here"</span> \\
     <span class="string">"${BASE_URL}/itinerary"</span></pre>
</div>

<!-- ============================================================ -->
<div class="footer">
  Built with <a href="https://supabase.com/docs/guides/functions" target="_blank" rel="noopener">Supabase Edge Functions</a>
  &nbsp;&middot;&nbsp;
  <a href="https://sheeets.xyz" target="_blank" rel="noopener">sheeets.xyz</a>
</div>

</div>
</body>
</html>`;
}

// --- Route Handlers -----------------------------------------------------------

async function handleGetEvents(params: URLSearchParams): Promise<Response> {
  const events = await getEvents();
  const filtered = filterEvents(events, params);
  return corsResponse({
    data: filtered.map(formatEvent),
    count: filtered.length,
  });
}

async function handleGetEventById(id: string): Promise<Response> {
  const events = await getEvents();
  const event = events.find((e) => e.id === id);
  if (!event) {
    return errorResponse("Event not found", 404);
  }
  return corsResponse({ data: formatEvent(event) });
}

async function handleGetConferences(): Promise<Response> {
  const events = await getEvents();
  const counts = new Map<string, number>();
  for (const e of events) {
    counts.set(e.conference, (counts.get(e.conference) || 0) + 1);
  }
  const conferences = Array.from(counts.entries()).map(([name, count]) => ({
    name,
    count,
  }));
  return corsResponse({ data: conferences });
}

async function handleGetTags(): Promise<Response> {
  const events = await getEvents();
  const tagCounts = new Map<string, number>();
  for (const e of events) {
    for (const tag of e.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const tags = Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return corsResponse({ data: tags });
}

async function handleGetDates(): Promise<Response> {
  const events = await getEvents();
  const dateCounts = new Map<string, number>();
  for (const e of events) {
    if (e.date_iso) {
      dateCounts.set(e.date_iso, (dateCounts.get(e.date_iso) || 0) + 1);
    }
  }
  const dates = Array.from(dateCounts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return corsResponse({ data: dates });
}

// --- Key Management Route Handlers -------------------------------------------

async function handleCreateKey(req: Request): Promise<Response> {
  // Authenticate via JWT
  const auth = await authenticateJwt(req);
  if (auth instanceof Response) return auth;

  const admin = getAdminClient();

  // Check key count limit
  const { count, error: countError } = await admin
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId)
    .is("revoked_at", null);

  if (countError) {
    return errorResponse("Failed to check key count", 500);
  }

  if ((count ?? 0) >= MAX_KEYS_PER_USER) {
    return errorResponse(
      `Maximum of ${MAX_KEYS_PER_USER} active API keys per user. Revoke an existing key first.`,
      400,
    );
  }

  // Parse request body
  let name = "default";
  let scopes = DEFAULT_SCOPES;

  try {
    const body = await req.json();
    if (body.name && typeof body.name === "string") {
      name = body.name.trim().slice(0, 100); // limit name length
    }
    if (Array.isArray(body.scopes) && body.scopes.length > 0) {
      // Validate all scopes
      const invalidScopes = body.scopes.filter(
        (s: unknown) => typeof s !== "string" || !VALID_SCOPES.includes(s as string),
      );
      if (invalidScopes.length > 0) {
        return errorResponse(
          `Invalid scopes: ${invalidScopes.join(", ")}. Valid scopes: ${VALID_SCOPES.join(", ")}`,
          400,
        );
      }
      scopes = body.scopes;
    }
  } catch {
    // Empty body is fine, use defaults
  }

  // Generate the raw key
  const rawKey = generateApiKey();
  const keyHash = await sha256Hex(rawKey);
  const keyPrefix = rawKey.substring(5, 13); // first 8 chars after "shts_"

  // Insert into database
  const { data: newKey, error: insertError } = await admin
    .from("api_keys")
    .insert({
      user_id: auth.userId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
      scopes,
    })
    .select("id, name, scopes, created_at")
    .single();

  if (insertError) {
    console.error("Failed to create API key:", insertError.message);
    return errorResponse("Failed to create API key", 500);
  }

  // Return the raw key ONCE -- it cannot be retrieved again
  return corsResponse(
    {
      key: rawKey,
      id: newKey.id,
      name: newKey.name,
      scopes: newKey.scopes,
      created_at: newKey.created_at,
    },
    201,
  );
}

async function handleListKeys(req: Request): Promise<Response> {
  // Authenticate via JWT
  const auth = await authenticateJwt(req);
  if (auth instanceof Response) return auth;

  const admin = getAdminClient();

  const { data: keys, error } = await admin
    .from("api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, created_at")
    .eq("user_id", auth.userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to list API keys:", error.message);
    return errorResponse("Failed to list API keys", 500);
  }

  return corsResponse({ data: keys });
}

async function handleRevokeKey(
  req: Request,
  keyId: string,
): Promise<Response> {
  // Authenticate via JWT
  const auth = await authenticateJwt(req);
  if (auth instanceof Response) return auth;

  const admin = getAdminClient();

  // Verify the key belongs to this user and is not already revoked
  const { data: existing, error: lookupError } = await admin
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("id", keyId)
    .single();

  if (lookupError || !existing) {
    return errorResponse("API key not found", 404);
  }

  if (existing.user_id !== auth.userId) {
    return errorResponse("API key not found", 404); // Don't reveal it exists
  }

  if (existing.revoked_at) {
    return errorResponse("API key is already revoked", 400);
  }

  // Soft-delete by setting revoked_at
  const { error: updateError } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId);

  if (updateError) {
    console.error("Failed to revoke API key:", updateError.message);
    return errorResponse("Failed to revoke API key", 500);
  }

  return corsResponse({ success: true });
}

// --- Phase 5: Friends Route Handlers (API key auth, friends:read) -------------

async function handleGetFriends(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "friends:read")) {
    return errorResponse("Missing required scope: friends:read", 403);
  }

  const admin = getAdminClient();
  const userId = auth.userId;

  // Query friendships where user is either user_a or user_b
  const { data: friendships, error: fErr } = await admin
    .from("friendships")
    .select("user_a, user_b")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  if (fErr) {
    console.error("Failed to fetch friendships:", fErr.message);
    return errorResponse("Failed to fetch friends", 500);
  }

  // Extract the friend IDs (the other side of each friendship)
  const friendIds = (friendships || []).map((f) =>
    f.user_a === userId ? f.user_b : f.user_a
  );

  if (friendIds.length === 0) {
    return corsResponse({ data: [] });
  }

  // Fetch profiles for all friends
  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("user_id, display_name, x_handle, email")
    .in("user_id", friendIds);

  if (pErr) {
    console.error("Failed to fetch friend profiles:", pErr.message);
    return errorResponse("Failed to fetch friend profiles", 500);
  }

  return corsResponse({ data: profiles || [] });
}

async function handleGetFriendsGoing(
  req: Request,
  params: URLSearchParams,
): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "friends:read")) {
    return errorResponse("Missing required scope: friends:read", 403);
  }

  const admin = getAdminClient();
  const userId = auth.userId;
  const eventId = params.get("eventId");

  // Get friend IDs
  const { data: friendships, error: fErr } = await admin
    .from("friendships")
    .select("user_a, user_b")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  if (fErr) {
    console.error("Failed to fetch friendships:", fErr.message);
    return errorResponse("Failed to fetch friends", 500);
  }

  const friendIds = (friendships || []).map((f) =>
    f.user_a === userId ? f.user_b : f.user_a
  );

  if (friendIds.length === 0) {
    return corsResponse({ data: [] });
  }

  // Fetch itineraries for all friends
  const { data: itineraries, error: iErr } = await admin
    .from("itineraries")
    .select("user_id, event_ids")
    .in("user_id", friendIds);

  if (iErr) {
    console.error("Failed to fetch friend itineraries:", iErr.message);
    return errorResponse("Failed to fetch friend itineraries", 500);
  }

  // Fetch profiles for display names
  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", friendIds);

  const profileMap = new Map(
    (profiles || []).map((p) => [p.user_id, p.display_name]),
  );

  let results = (itineraries || []).map((it) => ({
    user_id: it.user_id,
    display_name: profileMap.get(it.user_id) || null,
    event_ids: it.event_ids || [],
  }));

  // If eventId specified, filter to friends whose itinerary contains that event
  if (eventId) {
    results = results.filter((r) => r.event_ids.includes(eventId));
  }

  return corsResponse({ data: results });
}

// --- Phase 6: RSVP Route Handlers (API key auth) -----------------------------

async function handleGetRsvps(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "rsvps:read")) {
    return errorResponse("Missing required scope: rsvps:read", 403);
  }

  const admin = getAdminClient();

  const { data: rsvps, error } = await admin
    .from("rsvps")
    .select("event_id, status, method, created_at")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch RSVPs:", error.message);
    return errorResponse("Failed to fetch RSVPs", 500);
  }

  return corsResponse({ data: rsvps || [] });
}

async function handleCreateRsvp(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "rsvps:write")) {
    return errorResponse("Missing required scope: rsvps:write", 403);
  }

  let body: { eventId?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (!body.eventId || typeof body.eventId !== "string") {
    return errorResponse("Missing required field: eventId (string)", 400);
  }

  const eventId = body.eventId.trim();

  // Validate eventId exists in events cache
  const events = await getEvents();
  const event = events.find((e) => e.id === eventId);
  if (!event) {
    return errorResponse("Event not found", 404);
  }

  const admin = getAdminClient();

  // Upsert into rsvps table (UNIQUE on user_id + event_id)
  const { error } = await admin.from("rsvps").upsert(
    {
      user_id: auth.userId,
      event_id: eventId,
      status: "confirmed",
      method: "api",
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,event_id" },
  );

  if (error) {
    console.error("Failed to create RSVP:", error.message);
    return errorResponse("Failed to create RSVP", 500);
  }

  return corsResponse({ success: true, eventId, method: "api" }, 201);
}

// --- Phase 7: Recommendations Route Handler (API key auth) -------------------

async function handleGetRecommendations(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "recommendations:read")) {
    return errorResponse(
      "Missing required scope: recommendations:read",
      403,
    );
  }

  const admin = getAdminClient();
  const userId = auth.userId;

  // 1. Get user's itinerary
  const { data: itinerary } = await admin
    .from("itineraries")
    .select("event_ids")
    .eq("user_id", userId)
    .single();

  const userEventIds = new Set<string>(itinerary?.event_ids || []);

  // 2. Get all events
  const allEvents = await getEvents();

  // If user has no itinerary, return top events by default (can't personalize)
  if (userEventIds.size === 0) {
    const topEvents = allEvents.slice(0, 20).map((e) => ({
      ...formatEvent(e),
      score: 0,
      reasons: ["no_itinerary"],
    }));
    return corsResponse({ data: topEvents });
  }

  // 3. Collect tags from itinerary events, weighted by frequency
  const tagWeights = new Map<string, number>();
  for (const event of allEvents) {
    if (userEventIds.has(event.id)) {
      for (const tag of event.tags) {
        tagWeights.set(tag, (tagWeights.get(tag) || 0) + 1);
      }
    }
  }

  // 4. Get friends and their itineraries for social signal
  const { data: friendships } = await admin
    .from("friendships")
    .select("user_a, user_b")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  const friendIds = (friendships || []).map((f) =>
    f.user_a === userId ? f.user_b : f.user_a
  );

  // Build a map: eventId -> list of friend display names going
  const friendEventMap = new Map<string, string[]>();
  if (friendIds.length > 0) {
    const { data: friendItineraries } = await admin
      .from("itineraries")
      .select("user_id, event_ids")
      .in("user_id", friendIds);

    const { data: friendProfiles } = await admin
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", friendIds);

    const nameMap = new Map(
      (friendProfiles || []).map((p) => [
        p.user_id,
        p.display_name || "Friend",
      ]),
    );

    for (const fi of friendItineraries || []) {
      const name = nameMap.get(fi.user_id) || "Friend";
      for (const eid of fi.event_ids || []) {
        if (!friendEventMap.has(eid)) {
          friendEventMap.set(eid, []);
        }
        friendEventMap.get(eid)!.push(name);
      }
    }
  }

  // 5. Score remaining events (exclude events already in itinerary)
  const scored: {
    event: CachedEvent;
    score: number;
    reasons: string[];
  }[] = [];

  for (const event of allEvents) {
    if (userEventIds.has(event.id)) continue; // skip events already in itinerary

    let score = 0;
    const reasons: string[] = [];

    // Tag overlap scoring
    for (const tag of event.tags) {
      const weight = tagWeights.get(tag);
      if (weight) {
        score += weight;
        reasons.push(`tag:${tag}`);
      }
    }

    // Friends going scoring (each friend going = +3 points)
    const friendsGoing = friendEventMap.get(event.id);
    if (friendsGoing && friendsGoing.length > 0) {
      score += friendsGoing.length * 3;
      for (const name of friendsGoing) {
        reasons.push(`friend:${name}`);
      }
    }

    if (score > 0) {
      // Deduplicate reasons
      const uniqueReasons = [...new Set(reasons)];
      scored.push({ event, score, reasons: uniqueReasons });
    }
  }

  // 6. Sort by score descending, return top 20
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 20);

  const data = top.map((s) => ({
    ...formatEvent(s.event),
    score: s.score,
    reasons: s.reasons,
  }));

  return corsResponse({ data });
}

// --- Phase 4/9: Itinerary Route Handlers (API key auth) -----------------------

async function handleGetItinerary(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "itinerary:read")) {
    return errorResponse("Missing required scope: itinerary:read", 403);
  }

  const admin = getAdminClient();

  const { data: itinerary, error } = await admin
    .from("itineraries")
    .select("event_ids")
    .eq("user_id", auth.userId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found, which is fine (empty itinerary)
    console.error("Failed to fetch itinerary:", error.message);
    return errorResponse("Failed to fetch itinerary", 500);
  }

  const eventIds: string[] = itinerary?.event_ids || [];

  if (eventIds.length === 0) {
    return corsResponse({ data: [] });
  }

  // Join with events cache to return full event objects
  const allEvents = await getEvents();
  const eventMap = new Map(allEvents.map((e) => [e.id, e]));
  const events = eventIds
    .map((id) => eventMap.get(id))
    .filter(Boolean)
    .map((e) => formatEvent(e!));

  return corsResponse({ data: events });
}

async function handleAddToItinerary(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "itinerary:write")) {
    return errorResponse("Missing required scope: itinerary:write", 403);
  }

  let body: { eventIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (
    !body.eventIds ||
    !Array.isArray(body.eventIds) ||
    body.eventIds.length === 0
  ) {
    return errorResponse(
      'Missing required field: eventIds (non-empty array of strings)',
      400,
    );
  }

  const eventIds = body.eventIds.map((id) => String(id).trim());

  // Validate eventIds exist in events cache
  const allEvents = await getEvents();
  const validIds = new Set(allEvents.map((e) => e.id));
  const invalidIds = eventIds.filter((id) => !validIds.has(id));
  if (invalidIds.length > 0) {
    return errorResponse(
      `Events not found: ${invalidIds.join(", ")}`,
      404,
    );
  }

  const admin = getAdminClient();

  // Get existing itinerary
  const { data: existing } = await admin
    .from("itineraries")
    .select("event_ids")
    .eq("user_id", auth.userId)
    .single();

  const currentIds: string[] = existing?.event_ids || [];
  const currentSet = new Set(currentIds);

  // Merge: add new IDs without duplicates
  const newIds = eventIds.filter((id) => !currentSet.has(id));
  const mergedIds = [...currentIds, ...newIds];

  // Upsert
  const { error } = await admin.from("itineraries").upsert(
    {
      user_id: auth.userId,
      event_ids: mergedIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("Failed to add to itinerary:", error.message);
    return errorResponse("Failed to add to itinerary", 500);
  }

  return corsResponse({ success: true, eventIds: mergedIds });
}

async function handleRemoveFromItinerary(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "itinerary:write")) {
    return errorResponse("Missing required scope: itinerary:write", 403);
  }

  let body: { eventIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (
    !body.eventIds ||
    !Array.isArray(body.eventIds) ||
    body.eventIds.length === 0
  ) {
    return errorResponse(
      'Missing required field: eventIds (non-empty array of strings)',
      400,
    );
  }

  const removeSet = new Set(body.eventIds.map((id) => String(id).trim()));

  const admin = getAdminClient();

  // Get existing itinerary
  const { data: existing } = await admin
    .from("itineraries")
    .select("event_ids")
    .eq("user_id", auth.userId)
    .single();

  const currentIds: string[] = existing?.event_ids || [];
  const filteredIds = currentIds.filter((id) => !removeSet.has(id));

  // Update
  const { error } = await admin
    .from("itineraries")
    .upsert(
      {
        user_id: auth.userId,
        event_ids: filteredIds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("Failed to remove from itinerary:", error.message);
    return errorResponse("Failed to remove from itinerary", 500);
  }

  return corsResponse({ success: true, eventIds: filteredIds });
}

async function handleClearItinerary(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "itinerary:write")) {
    return errorResponse("Missing required scope: itinerary:write", 403);
  }

  const admin = getAdminClient();

  const { error } = await admin
    .from("itineraries")
    .upsert(
      {
        user_id: auth.userId,
        event_ids: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("Failed to clear itinerary:", error.message);
    return errorResponse("Failed to clear itinerary", 500);
  }

  return corsResponse({ success: true });
}

async function handleGetConflicts(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "itinerary:read")) {
    return errorResponse("Missing required scope: itinerary:read", 403);
  }

  const admin = getAdminClient();

  const { data: itinerary, error } = await admin
    .from("itineraries")
    .select("event_ids")
    .eq("user_id", auth.userId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Failed to fetch itinerary:", error.message);
    return errorResponse("Failed to fetch itinerary", 500);
  }

  const eventIds: string[] = itinerary?.event_ids || [];
  if (eventIds.length === 0) {
    return corsResponse({ data: [] });
  }

  // Get full event objects
  const allEvents = await getEvents();
  const eventMap = new Map(allEvents.map((e) => [e.id, e]));
  const userEvents = eventIds
    .map((id) => eventMap.get(id))
    .filter(Boolean) as CachedEvent[];

  // Find conflicts: events on the same day with overlapping time ranges
  const conflicts: {
    events: ReturnType<typeof formatEvent>[];
    overlap: string;
  }[] = [];

  for (let i = 0; i < userEvents.length; i++) {
    for (let j = i + 1; j < userEvents.length; j++) {
      const a = userEvents[i];
      const b = userEvents[j];

      // Must be on the same day
      if (a.date_iso !== b.date_iso || !a.date_iso) continue;

      // Skip all-day events (they don't really "conflict" with time-specific events)
      if (a.is_all_day || b.is_all_day) continue;

      const aStart = parseTimeToMinutes(a.start_time);
      const aEnd = parseTimeToMinutes(a.end_time) ||
        (aStart !== null ? aStart + 120 : null); // default 2h duration
      const bStart = parseTimeToMinutes(b.start_time);
      const bEnd = parseTimeToMinutes(b.end_time) ||
        (bStart !== null ? bStart + 120 : null);

      if (
        aStart === null || aEnd === null || bStart === null || bEnd === null
      ) {
        continue;
      }

      // Check overlap: events overlap if one starts before the other ends
      if (aStart < bEnd && bStart < aEnd) {
        const overlapStart = Math.max(aStart, bStart);
        const overlapEnd = Math.min(aEnd, bEnd);

        const formatMinutes = (m: number): string => {
          const h = Math.floor(m / 60);
          const min = m % 60;
          const ampm = h >= 12 ? "PM" : "AM";
          const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
          return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
        };

        conflicts.push({
          events: [formatEvent(a), formatEvent(b)],
          overlap: `${formatMinutes(overlapStart)} - ${formatMinutes(overlapEnd)}`,
        });
      }
    }
  }

  return corsResponse({ data: conflicts });
}

async function handleShareItinerary(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "itinerary:write")) {
    return errorResponse("Missing required scope: itinerary:write", 403);
  }

  const admin = getAdminClient();

  // Get user's current itinerary
  const { data: itinerary, error: fetchErr } = await admin
    .from("itineraries")
    .select("event_ids")
    .eq("user_id", auth.userId)
    .single();

  if (fetchErr && fetchErr.code !== "PGRST116") {
    console.error("Failed to fetch itinerary:", fetchErr.message);
    return errorResponse("Failed to fetch itinerary", 500);
  }

  const eventIds: string[] = itinerary?.event_ids || [];
  if (eventIds.length === 0) {
    return errorResponse("Cannot share an empty itinerary", 400);
  }

  // Generate a short code (8 chars, alphanumeric)
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const shortCode = Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 8);

  // Insert into shared_itineraries
  const { error: insertErr } = await admin.from("shared_itineraries").insert({
    short_code: shortCode,
    event_ids: eventIds,
    created_by: auth.userId,
  });

  if (insertErr) {
    console.error("Failed to share itinerary:", insertErr.message);
    return errorResponse("Failed to share itinerary", 500);
  }

  return corsResponse({
    code: shortCode,
    url: `https://sheeets.xyz/itinerary/s/${shortCode}`,
  });
}

async function handleExportItinerary(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (auth instanceof Response) return auth;
  if (!hasScope(auth, "itinerary:read")) {
    return errorResponse("Missing required scope: itinerary:read", 403);
  }

  const admin = getAdminClient();

  const { data: itinerary, error } = await admin
    .from("itineraries")
    .select("event_ids")
    .eq("user_id", auth.userId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Failed to fetch itinerary:", error.message);
    return errorResponse("Failed to fetch itinerary", 500);
  }

  const eventIds: string[] = itinerary?.event_ids || [];

  if (eventIds.length === 0) {
    return corsResponse({ data: [] });
  }

  // Join with events cache to return full event objects
  const allEvents = await getEvents();
  const eventMap = new Map(allEvents.map((e) => [e.id, e]));
  const events = eventIds
    .map((id) => eventMap.get(id))
    .filter(Boolean)
    .map((e) => formatEvent(e!));

  return corsResponse({ data: events });
}

// --- Router -------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    // Path after /agent-api/ -- handle both /agent-api and /agent-api/
    const fullPath = url.pathname;
    const basePath = "/agent-api";
    let path = fullPath;

    // Strip the base path prefix if present
    if (fullPath.startsWith(basePath)) {
      path = fullPath.substring(basePath.length);
    }
    // Also handle when invoked directly via functions/v1/agent-api
    if (path === "" || path === "/") path = "/";

    // Remove trailing slash (except for root)
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    const method = req.method;
    const params = url.searchParams;

    // -- Public Event Routes ---------------------------------------------------

    if (method === "GET" && path === "/") {
      // Content negotiation: return HTML docs for browsers, JSON for agents
      const accept = req.headers.get("Accept") || "";
      if (accept.includes("text/html")) {
        return new Response(generateDocsHtml(), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return corsResponse({
        name: "sheeets Agent API",
        version: "0.4.0",
        docs: "Visit this URL in a browser for interactive documentation",
        endpoints: {
          events: {
            "GET /events":
              "List/search events (?conference=, ?date=, ?tags=, ?search=, ?free=true, ?now=true)",
            "GET /events/:id": "Get single event by ID",
            "GET /events/conferences":
              "List conferences with event counts",
            "GET /events/tags": "List all unique tags with counts",
            "GET /events/dates": "List dates with event counts",
          },
          itinerary: {
            "GET /itinerary": "Get saved events (API key, itinerary:read)",
            "POST /itinerary/add": "Add events { eventIds: [...] } (API key, itinerary:write)",
            "POST /itinerary/remove": "Remove events { eventIds: [...] } (API key, itinerary:write)",
            "DELETE /itinerary": "Clear all (API key, itinerary:write)",
            "GET /itinerary/conflicts": "Detect scheduling conflicts (API key, itinerary:read)",
            "POST /itinerary/share": "Create shareable itinerary link (API key, itinerary:write)",
            "GET /itinerary/export": "Export as JSON (API key, itinerary:read)",
          },
          friends: {
            "GET /friends":
              "List friends with profiles (API key, friends:read)",
            "GET /friends/going":
              "Friends' itineraries, optionally filtered by ?eventId= (API key, friends:read)",
          },
          rsvps: {
            "GET /rsvps": "List your RSVPs (API key, rsvps:read)",
            "POST /rsvps":
              "RSVP to an event — { eventId } (API key, rsvps:write)",
          },
          recommendations: {
            "GET /recommendations":
              "Personalized event recommendations based on itinerary tags + friends (API key, recommendations:read)",
          },
          keys: {
            "POST /keys":
              "Create API key (JWT auth) — { name?, scopes? }",
            "GET /keys": "List your API keys (JWT auth, redacted)",
            "DELETE /keys/:id": "Revoke an API key (JWT auth)",
          },
        },
      });
    }

    if (method === "GET" && path === "/events") {
      return await handleGetEvents(params);
    }

    if (method === "GET" && path === "/events/conferences") {
      return await handleGetConferences();
    }

    if (method === "GET" && path === "/events/tags") {
      return await handleGetTags();
    }

    if (method === "GET" && path === "/events/dates") {
      return await handleGetDates();
    }

    // Event by ID -- must come after other /events/* routes
    if (method === "GET" && path.startsWith("/events/")) {
      const id = path.substring("/events/".length);
      if (id) {
        return await handleGetEventById(decodeURIComponent(id));
      }
    }

    // -- Key Management Routes (JWT auth) --------------------------------------

    if (method === "POST" && path === "/keys") {
      return await handleCreateKey(req);
    }

    if (method === "GET" && path === "/keys") {
      return await handleListKeys(req);
    }

    // DELETE /keys/:id
    if (method === "DELETE" && path.startsWith("/keys/")) {
      const keyId = path.substring("/keys/".length);
      if (keyId) {
        return await handleRevokeKey(req, decodeURIComponent(keyId));
      }
    }

    // -- Itinerary Routes (API key auth) ----------------------------------------
    // Static sub-paths MUST come before the base /itinerary route

    if (method === "POST" && path === "/itinerary/add") {
      return await handleAddToItinerary(req);
    }

    if (method === "POST" && path === "/itinerary/remove") {
      return await handleRemoveFromItinerary(req);
    }

    if (method === "GET" && path === "/itinerary/conflicts") {
      return await handleGetConflicts(req);
    }

    if (method === "POST" && path === "/itinerary/share") {
      return await handleShareItinerary(req);
    }

    if (method === "GET" && path === "/itinerary/export") {
      return await handleExportItinerary(req);
    }

    if (method === "GET" && path === "/itinerary") {
      return await handleGetItinerary(req);
    }

    if (method === "DELETE" && path === "/itinerary") {
      return await handleClearItinerary(req);
    }

    // -- Friends Routes (API key auth, friends:read) --------------------------

    if (method === "GET" && path === "/friends") {
      return await handleGetFriends(req);
    }

    if (method === "GET" && path === "/friends/going") {
      return await handleGetFriendsGoing(req, params);
    }

    // -- RSVP Routes (API key auth) --------------------------------------------

    if (method === "GET" && path === "/rsvps") {
      return await handleGetRsvps(req);
    }

    if (method === "POST" && path === "/rsvps") {
      return await handleCreateRsvp(req);
    }

    // -- Recommendations Route (API key auth) ----------------------------------

    if (method === "GET" && path === "/recommendations") {
      return await handleGetRecommendations(req);
    }

    // -- 404 -------------------------------------------------------------------

    return errorResponse(`Not found: ${method} ${path}`, 404);
  } catch (err) {
    console.error("Agent API error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
