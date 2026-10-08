# Host Analytics — Implementation Plan

Event hosts claim their event on plan.wtf, get verified **automatically via Luma** where possible (manual admin approval as fallback), and then see aggregate per-event analytics at `/host`.

_Revised 2026-10-01. Previous draft backed up outside the repo._

## 1. Context
- Events live only in Google Sheets (`src/lib/fetch-events.ts`). IDs are `evt-{base36(hash(conference|date|startTime|name))}` (+`-N` for duplicates). **Editing any of those four fields in the sheet changes the ID.**
- All Supabase activity tables key on that `event_id`: `event_tracking`, `itineraries.event_ids[]`, `rsvps`, `event_reactions`, `event_comments`, `check_ins`.
- `event_tracking` (impression / click / pin-click + `visitor_id`, `source`, `conference`, `url`) is batched via `src/lib/tracking-queue.ts` → `POST /api/events/track`. Client dedupes one per type per event per page session. `cleanup_old_tracking_data()` deletes rows older than 180 days (function currently absent in prod).
- Auth: Supabase email OTP. No API route verifies user JWTs yet; admin routes use `isAdminPassword` (`src/lib/admin-auth.ts`).
- `ad_events` is per ad, not per event — out of scope.

## 2. What Luma exposes publicly (tested 2026-10-01)
`GET https://api.lu.ma/url?url=<slug>` and `GET https://api.lu.ma/event/get?event_api_id=evt-…` return the same payload, no key:
- `event.api_id` (stable across slug changes), `event.url` (slug), `event.user_api_id` (creator), `calendar_api_id`
- `hosts[]`: `api_id`, `username`, `name`, `avatar_url`, `bio_short`, `twitter_handle`, `instagram_handle`, `linkedin_handle`, `website`, `is_verified`
- `calendar`: name, slug, socials, `is_verified`
- `description_mirror`: full description as ProseMirror JSON
- `ticket_types[].num_guests` (registration count; top-level `guest_count` can read 0 — sum ticket types)
- **No host emails.** `guest_data.email` is the viewer's own and null when signed out.
- `cf-cache-status: DYNAMIC` → description/bio edits are visible immediately.
- No public user-profile endpoint; host bios are only reachable through an event's `hosts[]`.

## 3. Verification design

| Option | Spoofable? | UX | Decision |
|---|---|---|---|
| (a) Code in Luma event description | No — needs edit access to the event | Paste, Verify, remove | **Primary** |
| (a′) Code in host's Luma bio (`hosts[].bio_short`) | No — needs control of a listed host account | Paste once, covers any event they host | **Primary alt** (co-hosts without description access) |
| (b) `profiles.x_handle` == `hosts[].twitter_handle` | **Yes** — x_handle is self-entered, unverified | Instant | Hint only, in admin queue |
| (c) Email match | n/a — not exposed | — | Rejected |
| (d) Add plan.wtf as co-host | Doesn't identify the claimant | High friction | Rejected |
| Manual admin review | Human judgment | Hours | **Fallback** (non-Luma links, code not found) |

### Flow
1. Signed-in user clicks **"Claim this event"** (signed-out → AuthModal).
2. `POST /api/host/claims {eventId}`:
   - Resolve the event server-side via `fetchEventsCached`; never trust a client-supplied link.
   - Luma link (`isLumaUrl`): `safeFetch('https://api.lu.ma/url?url=<slug>')` (slug `/^[A-Za-z0-9_-]{1,100}$/`, 8s timeout, 1MB cap); store `luma_event_api_id` + hosts snapshot.
   - Create claim: `status='pending'`, `method='luma_code'`, `verification_code = 'planwtf-' + 8 crypto-random base32 chars` (40 bits). Return code + instructions.
3. Modal: "Add `planwtf-K7Q2M9XD` anywhere in your Luma event description (or your Luma profile bio), save, then click Verify." Link to the Luma event.
4. `POST /api/host/claims/[id]/verify`:
   - `safeFetch` `api.lu.ma/event/get?event_api_id=…`.
   - Walk `description_mirror` (text + link hrefs), case-insensitive search for the code; else check each `hosts[].bio_short`.
   - Match → `status='verified'`, evidence `{matched_in: 'description'|'host_bio', luma_event_api_id, host_api_id?, host_name?, hosts, checked_at}`; tell the host they can remove the code.
   - No match → increment `verify_attempts`, return `not_found`, offer **"Request manual review"**.
5. Manual (`method='manual'`): claimant adds a note (role, contact, proof link); stays pending. Admin Claims tab shows event, claimant email/display name, Luma hosts + X handles, and a "handle matches" hint. Actions: Approve / Reject (reason) / Revoke.

### Security
- Codes are bound to one `(user, event)` claim — copying a code from a public Luma page can't verify anyone else.
- We only fetch the sheet's stored link (sheet is admin-controlled; submissions are admin-reviewed).
- Verification persists after the code is removed; admins can revoke.
- Verify cooldown ≥10s, ≤30 attempts per claim, ≤20 open pending claims per user.

## 4. Data model — `supabase/migrations/20261002120000_event_claims.sql`
```sql
create table public.event_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,                 -- current sheet ID
  event_ids text[] not null,              -- current + historical aliases (analytics scope)
  conference text not null,
  event_name text not null,               -- snapshot
  event_link text,                        -- snapshot of sheet link
  link_key text,                          -- normalized: 'luma:<slug>' or lowercased host+path
  luma_event_api_id text,
  method text not null check (method in ('luma_code','manual','admin_grant')),
  status text not null default 'pending'
    check (status in ('pending','verified','rejected','revoked','withdrawn')),
  verification_code text,
  verify_attempts int not null default 0,
  last_verify_at timestamptz,
  claimant_note text check (char_length(claimant_note) <= 1000),
  evidence jsonb not null default '{}',
  review_note text,
  reviewed_by text,                       -- 'admin' (password auth has no user id)
  reviewed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index event_claims_one_open on public.event_claims(user_id, event_id)
  where status in ('pending','verified');
create index event_claims_event_ids_gin on public.event_claims using gin(event_ids);
create index event_claims_status on public.event_claims(status, created_at desc);
create index event_claims_link_key on public.event_claims(conference, link_key);
alter table public.event_claims enable row level security;
create policy "own claims readable" on public.event_claims
  for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policies: all writes go through API routes with the service role.
```
- **Event-ID drift:** `GET /api/host/events` loads current events; for any claim whose `event_id` disappeared, find the event in the same `conference` with the same `link_key` (or same `luma_event_api_id`). Exactly one match → update `event_id`, append to `event_ids`. None → return `orphaned: true`; analytics still run over historical `event_ids`. Admin can "re-link to event…" from the Claims tab. `normalizeEventLink()` lives in `src/lib/luma.ts` with unit tests.
- Supporting indexes (same migration): `event_tracking(event_id, created_at)`; GIN on `itineraries(event_ids)` (confirm column type first — `jsonb_path_ops` if jsonb).

## 5. Analytics RPC — `supabase/migrations/20261002130000_host_event_stats.sql`
`get_host_event_stats(p_claim_id uuid, p_days int default 30, p_tz text default 'UTC') returns json` — `security definer`, `stable`, `set search_path = public`.
- Guard: the claim must belong to `auth.uid()` and be `verified`, else `raise exception 'forbidden'`. `revoke from public, anon; grant execute to authenticated, service_role`. `p_days` clamped 1..180.
- Core logic in internal `get_event_stats_for_ids(ids text[], conference text, …)` (service_role only); the host RPC is guard + call. Admin "Preview stats" uses the internal function.

| Metric | Definition |
|---|---|
| impressions | count of `impression` rows (one per page session) |
| unique_viewers | distinct `visitor_id` among impressions |
| clicks / unique_clickers | `type='click'` (outbound link) |
| pin_clicks | `type='pin-click'` |
| ctr | unique_clickers / unique_viewers |
| by_source | `{source: {impressions, clicks}}`; buckets < 3 folded into "other" |
| daily[] | per day in `p_tz`: impressions, unique_viewers, clicks |
| stars | `itineraries` rows where `event_ids && ids` (current state) |
| rsvps | confirmed `rsvps` for `ids` |
| check_ins | distinct users in `check_ins` |
| reactions | total + `{emoji: count}` |
| comments | count |
| benchmark | same-conference events with ≥1 impression in window: median & p75 of unique_viewers and ctr, this event's percentile, `n_events` |

- **Privacy:** numbers only — no visitor IDs, user IDs, comment text, or individual check-ins.
- `get_host_claim_summaries()` returns unique_viewers / clicks / stars per verified claim for the list view in one call.
- **Retention:** raw tracking is 180 days. Phase 3 adds `event_tracking_daily` (nightly rollup via Vercel cron) so older windows read from the rollup ("sum of daily uniques").

## 6. API routes
New `src/lib/server-auth.ts`: `getUserFromRequest(req)` reads `Authorization: Bearer <access_token>` → `supabase.auth.getUser(token)` → `{user}` or 401.

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/host/claims` | user | Create claim (Luma code, or manual with note) |
| `POST /api/host/claims/[id]/verify` | owner | Check Luma for the code |
| `POST /api/host/claims/[id]/manual` | owner | Switch to manual review with a note |
| `DELETE /api/host/claims/[id]` | owner | Withdraw / unclaim |
| `GET /api/host/events` | user | List own claims, fix ID drift, attach summaries |
| `GET /api/host/events/[claimId]/stats?days=` | user | RPC with the user's JWT; adds Luma registrations (sum `num_guests`, 10-min cache); `Cache-Control: private, max-age=60` |
| `GET /api/admin/claims?password=&status=` | admin | Review queue, enriched with claimant profile + Luma hosts |
| `POST /api/admin/claims/[id]` | admin | `{action: approve\|reject\|revoke\|relink\|grant, note, eventId?}` |

Zod schemas in `src/lib/api-validation.ts`: `ClaimCreateSchema`, `ClaimManualSchema`, `AdminClaimActionSchema`.

## 7. UI
- **Entry points:** small "Host? Claim this event" link in `EventDetailModal` (`src/components/TableView.tsx`) and `EventPopup.tsx`; EventCard `⋯` menu only if there's room. Shows "View analytics" instead when already verified.
- **`ClaimEventModal.tsx`:** confirm event → Luma path (copyable code, "Open Luma event", Verify with cooldown, helpful not-found error) → success → "Go to dashboard". Manual path: note → "We'll review within ~24h". Non-Luma links go straight to manual.
- **`/host` page** (client, noindex): claims with status chips (Pending / Verified / Rejected / Orphaned). Verified claim → KPI tiles (Unique viewers, Link clicks, CTR, Stars, RSVPs, Check-ins, Reactions, Comments, Luma registrations) with ▲/▼ vs conference median; 7/30/90-day toggle; daily trend chart; source bars; emoji breakdown; footnote "Aggregate, anonymized; data kept 180 days."
- **Charts:** inline SVG in `src/components/host/` (`TrendChart`, `BarList`, `StatTile`) using theme CSS variables — no Chart.js CDN (would need a CSP exception and adds weight on a public page).
- **User menu:** "Host dashboard" link when the user has ≥1 claim.
- **Admin `ClaimsTab.tsx`** (SubmissionsTab pattern): status + conference filters; event, claimant (email, name, x_handle), method, evidence, "handle matches a Luma host" badge, warning if another verified claim exists; Approve / Reject / Revoke / Relink / Preview stats. Register in `src/app/admin/page.tsx`; optional pending count in the tab label.

## 8. Abuse, rate limits, privacy, edge cases
- **Vercel firewall rules (per IP):** `/api/host/claims` POST 10/min · `/api/host/claims/*/verify` 6/min · `/api/host/claims/*/manual` 3/min · `/api/host/events*` 30/min · `/api/admin/claims*` 20/min. Backed by DB-level cooldown / attempt / pending caps.
- Luma fetches only in create and verify; always `safeFetch`, slug-validated, never client URLs.
- Privacy: aggregates only, small buckets suppressed; hosts never see who starred, reacted or checked in. Add a line to the privacy page.
- Multiple co-hosts may each hold a verified claim. Transfer = new host verifies; old host withdraws or admin revokes. Revocation is immediate (RPC checks status on every call). Admin tab flags manual claims on already-verified events. Account deletion cascades. A code left in a description is harmless.

## 9. Phases & files
**Phase 1 — Claims & verification (~2.5 days)**
- Migration `20261002120000_event_claims.sql`
- `src/lib/luma.ts`: `normalizeEventLink`, `fetchLumaEvent(slug|apiId)` via safeFetch, `extractMirrorText(doc)`, `findVerificationCode(payload, code)`
- `src/lib/server-auth.ts`; schemas in `src/lib/api-validation.ts`
- Routes: `src/app/api/host/claims/route.ts`, `[id]/route.ts`, `[id]/verify/route.ts`, `[id]/manual/route.ts`; `src/app/api/admin/claims/route.ts`, `[id]/route.ts`
- `src/components/ClaimEventModal.tsx` + entry points in `TableView.tsx`, `EventPopup.tsx`
- `src/components/admin/ClaimsTab.tsx` + registration in `src/app/admin/page.tsx`
- Tests: `luma-verify.test.ts` (nested marks/links, case-insensitivity, bio match, no partial-code false positives), `normalize-link.test.ts`, schema tests; recorded fixture `__tests__/fixtures/luma-event.json`
- Vercel rate-limit rules for the new routes

**Phase 2 — Dashboard (~2.5 days)**
- Migration `20261002130000_host_event_stats.sql` (internal stats fn, host RPC, summaries, indexes)
- `src/app/api/host/events/route.ts`, `src/app/api/host/events/[claimId]/stats/route.ts`
- `src/app/host/page.tsx`, `src/components/host/{StatTile,TrendChart,BarList,ClaimList}.tsx`, `src/hooks/useHostClaims.ts`
- Admin "Preview stats" (`/api/admin/claims/[id]/stats`)
- Tests: `resolveClaimEvent(claim, events)` re-link logic, chart scaling helpers; manual RPC checks (non-owner → forbidden, revoked → forbidden, `p_days` clamped)

**Phase 3 — Polish (~2 days)**
- Public `get_verified_event_ids()` + "Verified host" badge
- `event_tracking_daily` rollup + cron route + `vercel.json` entry
- Approve/reject email notifications (reuse `/api/notify`)
- Optional: a verified Luma host covers all their events (store `host_api_id`, auto-verify future claims)
- CSV export of the host's own aggregates

**Total ≈ 7 dev-days.** Migrations are additive and safe to apply before the code ships.

## 10. Decisions (Snax, 2026-10-01)
1. **A verified Luma host covers all their events** — store `host_api_id` on verification; future claims auto-verify when that host appears in the event's Luma `hosts[]` (moved into Phase 1).
2. **Friends-only reactions/comments count** toward host totals (counts only, never content).
3. **Show a public "Verified host" badge** (Phase 3).
4. **Free for now.**
5. **Our admin team reviews manual claims; promise 48 hours.**
6. **Hosts might need stats older than 180 days** → the `event_tracking_daily` rollup is required (Phase 2, before data ages out).
7. Non-Luma auto-verification: later.
