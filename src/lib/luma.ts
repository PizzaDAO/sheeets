// Pure Luma helpers, safe to import from client components.
// Server-only fetching lives in `luma-server.ts` (uses safe-fetch / node APIs).

const LUMA_HOSTS = new Set(['lu.ma', 'www.lu.ma', 'luma.com', 'www.luma.com']);

/** Valid Luma event slug (also what we're willing to send to api.lu.ma). */
export const LUMA_SLUG_RE = /^[A-Za-z0-9_-]{1,100}$/;
/** Valid Luma event api id, e.g. `evt-G9AqnOFI4wwbkKT`. */
export const LUMA_EVENT_API_ID_RE = /^evt-[A-Za-z0-9]{1,40}$/;

export function isLumaUrl(url: string): boolean {
  try {
    return LUMA_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function getLumaSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!LUMA_HOSTS.has(u.hostname.toLowerCase())) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

/** Luma slug for a link, only if it is a Luma URL with a slug safe to query. */
export function getValidLumaSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const slug = getLumaSlug(url.trim());
  return slug && LUMA_SLUG_RE.test(slug) ? slug : null;
}

/**
 * Normalize an event link into a stable key used to re-find a claimed event
 * after its sheet ID changes:
 * - Luma links → `luma:<slug>` (lowercased; lu.ma and luma.com are the same)
 * - other http(s) links → lowercased host (without `www.`) + path, no
 *   query/hash/trailing slash
 * Returns null for empty / unparseable / non-http links.
 */
export function normalizeEventLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const raw = link.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (!host) return null;
  if (LUMA_HOSTS.has(host) || LUMA_HOSTS.has(`www.${host}`)) {
    const slug = u.pathname.split('/').filter(Boolean)[0];
    return slug ? `luma:${slug.toLowerCase()}` : null;
  }
  let path = u.pathname.replace(/\/+$/, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep encoded */
  }
  return `${host}${path.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Luma payload types (subset of GET api.lu.ma/url and api.lu.ma/event/get)
// ---------------------------------------------------------------------------

export interface LumaHost {
  api_id: string;
  name?: string | null;
  username?: string | null;
  bio_short?: string | null;
  twitter_handle?: string | null;
  is_verified?: boolean | null;
}

export interface MirrorNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  marks?: { type?: string; attrs?: Record<string, unknown> | null }[] | null;
  content?: MirrorNode[] | null;
}

export interface LumaEventPayload {
  api_id?: string;
  event?: { api_id?: string; url?: string; name?: string; user_api_id?: string };
  hosts?: LumaHost[];
  description_mirror?: MirrorNode | null;
  ticket_types?: { num_guests?: number | null }[];
  guest_count?: number | null;
}

/** Compact hosts snapshot stored with a claim (no avatars, no bios). */
export interface LumaHostSnapshot {
  api_id: string;
  name: string | null;
  username: string | null;
  twitter_handle: string | null;
}

export function snapshotHosts(payload: LumaEventPayload): LumaHostSnapshot[] {
  return (payload.hosts ?? [])
    .filter((h) => h && typeof h.api_id === 'string')
    .slice(0, 50)
    .map((h) => ({
      api_id: h.api_id,
      name: h.name ?? null,
      username: h.username ?? null,
      twitter_handle: h.twitter_handle ?? null,
    }));
}

/** The event's stable Luma api id (`evt-…`), if present and well-formed. */
export function getLumaEventApiId(payload: LumaEventPayload): string | null {
  const id = payload.event?.api_id ?? payload.api_id;
  return typeof id === 'string' && LUMA_EVENT_API_ID_RE.test(id) ? id : null;
}

// ---------------------------------------------------------------------------
// Description text extraction + verification code search
// ---------------------------------------------------------------------------

const HREF_KEYS = ['href', 'src', 'url'];

function collectHrefs(attrs: Record<string, unknown> | null | undefined, out: string[]) {
  if (!attrs) return;
  for (const k of HREF_KEYS) {
    const v = attrs[k];
    if (typeof v === 'string' && v) out.push(v);
  }
}

/**
 * Flatten a ProseMirror document (Luma's `description_mirror`) into plain text.
 * Adjacent inline text nodes are concatenated without separators (so a code
 * split across bold/italic/link marks is still found); block nodes and hard
 * breaks become newlines. Link hrefs (mark and node attrs) are appended on
 * their own lines.
 */
export function extractMirrorText(doc: MirrorNode | null | undefined): string {
  if (!doc || typeof doc !== 'object') return '';
  const parts: string[] = [];
  const hrefs: string[] = [];
  let depth = 0;

  const walk = (node: MirrorNode) => {
    if (!node || typeof node !== 'object' || depth > 200) return;
    depth++;
    if (typeof node.text === 'string') parts.push(node.text);
    if (node.type === 'hard_break') parts.push('\n');
    collectHrefs(node.attrs, hrefs);
    if (Array.isArray(node.marks)) {
      for (const m of node.marks) collectHrefs(m?.attrs, hrefs);
    }
    const children = Array.isArray(node.content) ? node.content : [];
    for (const child of children) walk(child);
    // Any node with children is a block-ish container: separate from siblings.
    if (children.length > 0) parts.push('\n');
    depth--;
  };
  walk(doc);

  const text = parts.join('').replace(/\n{2,}/g, '\n').trim();
  return hrefs.length ? `${text}\n${hrefs.join('\n')}` : text;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True if `code` appears in `text` as a whole token (case-insensitive). The
 * code must not be glued to other alphanumerics, so `planwtf-ABCD1234` does
 * not match inside `planwtf-ABCD12345` or `xplanwtf-ABCD1234`.
 */
export function textContainsCode(text: string | null | undefined, code: string): boolean {
  if (!text || !code) return false;
  const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(code)}(?![A-Za-z0-9])`, 'i');
  return re.test(text);
}

export type VerificationMatch =
  | { matched_in: 'description' }
  | { matched_in: 'host_bio'; host_api_id: string; host_name: string | null };

/**
 * Look for a claim's verification code in a Luma event payload: first the
 * event description (text + link hrefs), then each listed host's bio.
 *
 * Security: only a `host_bio` match proves control of a Luma host account
 * (and may grant host-wide coverage). A `description` match only proves edit
 * access to this one event.
 */
export function findVerificationCode(
  payload: LumaEventPayload | null | undefined,
  code: string
): VerificationMatch | null {
  if (!payload || !code) return null;
  if (textContainsCode(extractMirrorText(payload.description_mirror), code)) {
    return { matched_in: 'description' };
  }
  for (const h of payload.hosts ?? []) {
    if (h && typeof h.api_id === 'string' && textContainsCode(h.bio_short, code)) {
      return { matched_in: 'host_bio', host_api_id: h.api_id, host_name: h.name ?? null };
    }
  }
  return null;
}

/** Registration count: sum of ticket types (top-level guest_count can read 0). */
export function getLumaRegistrationCount(payload: LumaEventPayload): number {
  const sum = (payload.ticket_types ?? []).reduce(
    (acc, t) => acc + (typeof t?.num_guests === 'number' ? t.num_guests : 0),
    0
  );
  return sum || (typeof payload.guest_count === 'number' ? payload.guest_count : 0);
}

/** Normalize an X/Twitter handle for comparison (strip @, URL, case). */
export function normalizeHandle(h: string | null | undefined): string | null {
  if (!h) return null;
  const s = h
    .trim()
    .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
  return s || null;
}
