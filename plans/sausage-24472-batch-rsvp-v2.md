# Batch RSVP v2 (automated where allowed) — Implementation Plan

Task `sausage-24472` "Batch RSVP / Auto Sign-up for Luma Events". **Replaces PR #153** (closed) and **supersedes `plans/luma-rsvp.md`** (task `tomato-78283`).

Goal: a signed-in user picks the Luma events in their itinerary, answers everything once, and plan.wtf **registers them automatically wherever Luma allows it**. Everything else goes into a one-at-a-time "Finish on Luma" queue with answers prefilled for copying. One wizard covers both: _"12 auto-registered · 5 need you to finish on Luma"_. RSVP status is tracked in sheeets.

_Written 2026-10-09. Base all work on `origin/master` (local `master` has diverged: 1 local commit vs 4 remote)._

---

## 1. Context (verified 2026-10-09)

### 1.1 What's already on master
- **Single-event RSVP shipped in #122 (calzone-34833).** This is most of the tomato-78283 plan: `RsvpButton` (Luma links only), `RsvpOverlay` (bottom sheet: copy chips plus an iframe of `lu.ma/embed/event/{slug}/simple`, then a manual "Done — I RSVP'd"), and `useRsvp` (reads and inserts `rsvps`, `method='manual'`). The CSP `frame-src` already allows `lu.ma`, `luma.com`, and `*.luma.com`.
- **Host claims + Luma verification shipped in #177.** This added `event_claims`, `verified_luma_hosts`, `src/lib/luma.ts` (`getValidLumaSlug`, `normalizeEventLink`, `LUMA_SLUG_RE`, `LUMA_EVENT_API_ID_RE`), `src/lib/luma-server.ts` (`fetchLumaEvent` via `safeFetch`), and `src/lib/server-auth.ts` (`getUserFromRequest`, `getServiceSupabase`).
- `useProfile` selects `*`, so new profile columns arrive automatically. Only the `UserProfile` type and the editor UI need updating.

### 1.2 Prod DB state (read-only `information_schema` / `pg_policies` queries via `npx supabase db query --linked`)

| Object | In prod? | Notes |
|---|---|---|
| `20260504140000_batch_rsvp_profile` | **Yes**, recorded in `schema_migrations` | `profiles.phone, website, first_name, last_name` exist |
| `20260504150000_batch_rsvp_tables` | **Yes**, recorded | `luma_form_fields` (0 rows), `custom_field_answers` (0 rows), `batch_rsvp_jobs` (0 rows) |
| `20260929140000_batch_rsvp_jobs_tighten_rls` | **Effectively yes, not recorded** | `batch_rsvp_jobs` has only the `select` policy. It was applied by hand; the file is only on the #153 branch |
| `rsvps` | Yes, **not in any repo migration** | `id uuid`, `user_id` (FK to auth.users, **no cascade**), `event_id`, `luma_api_id` (nullable), `status` default `'confirmed'`, `method` default `'api'`, `created_at`. UNIQUE `(user_id, event_id)`. RLS: own select/insert/update, no delete. **4 rows, all `confirmed/manual`** |

Note: `schema_migrations` stops at `20260929120000`. Later migrations (`event_claims`, etc.) were applied by hand. New migrations in this plan must be idempotent (`if not exists` / `drop policy if exists`).

### 1.3 PR #153: reuse vs drop

| #153 piece | Verdict |
|---|---|
| `BatchRsvpModal.tsx` 4-step wizard (select → profile → custom → review → results) | **Reuse the shell and steps**. Replace review/results with the new "Plan" and "Register" steps (§4) |
| `useBatchRsvp.ts` (selection, scanned map, answers map, step machine) | **Reuse**. Replace `submit`/polling with the new routes |
| `POST /api/luma/scan-form` + `luma-form-scanner.ts` (`safeFetch`, slug regex, `mapQuestionToProfileField`) | **Reuse, refactored**: build on `fetchLumaEvent()` from `luma-server.ts` (no duplicate fetch code), classify eligibility, and cache in `luma_form_fields` |
| `api-validation.ts` schemas, `LUMA_ID_RE`, length caps | **Reuse** (`ScanFormFieldsSchema`; adapt `BatchRsvpSubmitSchema`) |
| Email = signed-in OTP email, read-only in the wizard | **Keep**, enforced server-side (the client never sends an email) |
| Extended profile fields + `useProfile` changes | **Keep** (columns already in prod) |
| `RsvpButton` extra states | **Keep**, extended to the new statuses |
| `luma_form_fields`, `custom_field_answers`, `batch_rsvp_jobs` tables | **Reuse** (all empty; altered in §5) |
| `scripts/process-batch-rsvp.ts` (headed Playwright), `luma-registration.ts` (`POST api.lu.ma/event/register` with `x-luma-turnstile-token`), `scripts/scan-luma-forms.ts` | **Drop** (see §2) |
| `/api/batch-rsvp` job API | **Drop**. Replaced by `/api/rsvp/*` (§6) |
| Orange FAB in `EventApp` | **Reuse the idea**. Also add an entry point on `/itinerary` (coordinate with `pineapple-22344`) |

---

## 2. What Luma supports: automation paths ranked

### 2.1 Research findings (with sources)
- **Official API (`public-api.luma.com/v1`)** needs **Luma Plus** on the calendar. Keys are **scoped to one calendar** (org keys cover all of an org's calendars). Header: `x-luma-api-key`. [Luma API help](https://help.luma.com/p/luma-api), [Getting started](https://docs.luma.com/reference/getting-started-with-your-api.md)
- **`POST /v1/events/guests/add`** adds guests to an event the key manages. Params:
  - `guests[{email, name}]`
  - `approval_status`: `approved` (default), `pending_approval`, or `waitlist`
  - `ticket` / `tickets` (by `event_ticket_type_id`)
  - `registration_answers[{question_id, value}]`
  - `send_email` (default true)

  Guests are added in the background. The response lists `skipped` emails (unsubscribed, blocked, removed). [Add Guests](https://docs.luma.com/reference/post_v1-events-guests-add.md)
- **`GET /v1/events/guests/get?event_id=&id=<email>`** returns `approval_status` ∈ `approved | session | pending_approval | invited | declined | waitlist` and `registered_at`. [Get Guest](https://docs.luma.com/reference/get_v1-events-guests-get.md)
- **`GET /v1/events/get?event_id=`** returns `access: "manage"` for events the key manages and `"view"` otherwise. This is how we prove a key can register guests for an event. [Get Event](https://docs.luma.com/reference/get_v1-events-get.md)
- **Webhooks** `guest.registered` / `guest.updated` (payload: event id, `user_email`, `approval_status`). Signing and retries are **not documented**. [guest.updated](https://docs.luma.com/reference/webhook_guest_updated.md), [API index](https://docs.luma.com/llms.txt)
- **Rate limit**: 200 req/min per calendar (500/min per org key). On a 429 the caller is blocked for 1 minute. [Rate limits](https://docs.luma.com/reference/rate-limits.md)
- **There is no attendee API.** Nothing lets a third party register a user for an event it doesn't manage, or list a user's registrations. [API index](https://docs.luma.com/llms.txt)
- **Luma OAuth exists but isn't open to us.** It's used by Zapier and the MCP server. The MCP server lets an attendee *list what they're attending*, but has **no attendee register/RSVP tool**. "Luma doesn't support OAuth dynamic client registration and doesn't issue client IDs or secrets"; only Client-ID-Metadata-Document clients (Claude, ChatGPT, Codex, Grok) connect. [Luma MCP](https://help.luma.com/p/mcp)
- **Embeds**:
  - Checkout button: `data-luma-action="checkout"`, `data-luma-event-id="evt-…"`, optional `data-luma-coupon`, `data-luma-utm-source`, `data-luma-ticket-type`.
  - Iframe: `luma.com/embed/event/evt-…/simple` (`?tt=ttyp-…`, `utm_*` must be added to `src` manually).
  - **Documented postMessage**: on registration Luma posts `{type:"luma:purchase", transaction_id, value, …}` from origin `https://luma.com`. "It fires for free registrations too, with a value of 0."
  - **No documented name/email prefill.** Apple Pay doesn't work inside embeds.

  [Embed Luma](https://help.luma.com/p/embed-luma-on-your-website)
- **Personal iCal feed**: Luma Settings → Calendar Syncing → "Add iCal Subscription". It includes events you host and events you've registered for (approved, waitlisted, or pending approval), but not declined ones. The URL format, per-event status, and revocation are **not documented**. [iCal syncing](https://help.luma.com/p/ical-syncing)
- **Terms of Use**: "you must not access the Service by any means other than our publicly supported interfaces", and Luma may suspend access "for any reason". [luma.com/terms](https://luma.com/terms)
- **Turnstile on the private endpoint**: #153's own `luma-registration.ts` documents that `POST api.lu.ma/event/register` requires an `x-luma-turnstile-token`; without it Luma returns `additional-verification-required`. #153's processor notes that Turnstile blocks headless browsers and "may still block Playwright-driven Chrome".
- **The public read payload (`api.lu.ma/url?url=<slug>`, already used by #177) has everything eligibility needs** (fetched live for `espresso-hh`):
  - `event.calendar_api_id`, `event.api_id`
  - `ticket_info{is_free, require_approval, is_sold_out, spots_remaining}`, `ticket_types[{api_id, cents, require_approval, spots_remaining, is_hidden, is_disabled}]`
  - `registration_availability`, `waitlist_active`, `registration_questions[]`, `name_requirement`
  - `phone_number_requirement`, `eth_address_requirement`, `solana_address_requirement`
  - `guest_data` (viewer-specific; always null server-side)

### 2.2 Ranking

| # | Path | Reliability | ToS / legal risk | Effort | Verdict |
|---|---|---|---|---|---|
| 1 | **Host-authorized official API** (host connects a Luma Plus calendar/org key; plan.wtf calls `guests/add` for opted-in events) | High: documented, stable, 200 rpm | **Low**: documented API used by its owner for their own event; user consents explicitly | M–L (~5 d) | **Build. The primary automation path** |
| 2 | Luma private `api.lu.ma/event/register` called server-side | **Very low**: needs a Turnstile token bound to a real browser challenge; undocumented body (`expected_amount_cents`, `ticket_type_to_selection`, …) can change at any time | **High**: outside "publicly supported interfaces"; getting a token server-side means captcha-solving (circumventing security). Account flagging risk. **Blocking Vercel egress would also break #177 host verification and form scanning**, which use `api.lu.ma` | M, plus an endless maintenance tail | **Do not build** (guardrails in Appendix A if Snax overrides) |
| 3 | User-delegated Luma OAuth | n/a for registration: no attendee register capability exists; no client IDs issued | Low if it ever exists | — | **Not possible today.** Possible future confirmation-only path (list "what I'm attending"); ask Luma (§11) |
| 4 | Hosted browser automation (#153 moved to Browserbase etc.) | Low: Turnstile flags datacenter IPs and automation; Luma sign-in needs an email OTP per user, so we'd have to handle users' login codes | High: same ToS clause, plus we'd act as the user inside their Luma account | L, plus $/session and 30–60 s per event | **Reject** |
| — | Fallback: **"Finish on Luma" queue** (official embed iframe + documented `luma:purchase` postMessage + manual check-off) | High | None (official embed) | S–M | **Build first (Phase 1)**; covers every event path 1 can't |

### 2.3 Which events can be automated
- **Today: none.** Automation needs a host to opt in, and no host has connected yet.
- **Once its host opts in (Phase 2): auto-registered** when all of the following hold:
  1. The event's `calendar_api_id` matches an active plan.wtf host connection, and `events/get` returns `access:"manage"`.
  2. The host enabled auto-RSVP for it (calendar default or per-event).
  3. Registration is open (`registration_availability` is open and the event hasn't started).
  4. It's free, **or** the host picked a ticket type for plan.wtf guests (comp or free).
  5. There's no wallet/token-gate requirement (`eth_address_requirement` / `solana_address_requirement` / token-gated ticket), unless the host waives it for plan.wtf guests.
  6. The user answered every required question in the wizard.

  Approval-required events get `pending_approval` (§7). Sold-out events with a waitlist get `waitlist`.
- **Everything else goes to the "Finish on Luma" queue**: non-connected hosts, paid tickets, wallet-gated events, and the user's choice ("I'll do this one myself").

---

## 3. UX flow (wireframe-level)

**Entry points**
- Orange pill "RSVP to N events" (the #153 FAB idea), shown when signed in and the itinerary has un-RSVP'd upcoming Luma events.
- The same button in the `/itinerary` header.
- The per-event `RsvpButton` keeps opening the single-event flow, which becomes a 1-item Register queue.

```
Step 1 · Select                          Step 2 · You
┌──────────────────────────────┐         ┌──────────────────────────────┐
│ RSVP to your itinerary   [x] │         │ Registering as               │
│ [✓] Select all (17)          │         │ sam@…  (your login, locked)  │
│ AUTO ─────────────────────── │         │ First [Sam]  Last [W…]       │
│ [✓] ⚡ ETH Brunch   Tue 10am │         │ Company [..] Title [..]      │
│ [✓] ⚡ Devs & Dogs  Tue 6pm  │         │ X @..  TG @..  Phone [..]    │
│ FINISH ON LUMA ───────────── │         │ LinkedIn [..] Website [..]   │
│ [✓] 💳 Gala ($40)  Wed 8pm   │         │ [ ] Save to my profile       │
│ [✓] ↗ Hack Night   Wed 9pm   │         │            [Back] [Next]     │
│ ALREADY RSVP'D ───────────── │         └──────────────────────────────┘
│  ✓ Coffee Crawl (Luma)       │
│ [Scan] → [Next]              │   Badges: ⚡ auto · ↗ finish on Luma ·
└──────────────────────────────┘   💳 paid · ⏳ approval · 🕒 waitlist
                                   · ⛔ closed (unselectable, with reason)

Step 3 · Questions (skipped if none)     Step 4 · Review & consent
┌──────────────────────────────┐         ┌──────────────────────────────┐
│ Asked by 3 events:           │         │ ⚡ Auto-register 12 events   │
│ "How did you hear about us?" │         │   Hosts get: name, email,    │
│ [ plan.wtf          ]  ↺ used │         │   your answers. Luma emails  │
│ ETH Brunch only:             │         │   you each confirmation.     │
│ "Wallet?" (required) [....]  │         │ ↗ Finish on Luma: 5 events   │
│ Terms: [✓] I agree (view)    │         │ [✓] I agree to share my info │
│            [Back] [Next]     │         │     with these hosts (list)  │
└──────────────────────────────┘         │     [Register]               │
                                         └──────────────────────────────┘
Step 5 · Register
┌──────────────────────────────────────────────────────────────┐
│ ✓ 10 registered · ⏳ 2 pending approval · ↗ 5 to finish      │
│ ⚡ ETH Brunch ............ ✓ Going                            │
│ ⚡ Devs & Dogs ........... ⏳ Requested (host approves)       │
│ ↗ Gala ($40) ............ [Open]  [Mark done] [Skip]        │
│ ↗ Hack Night ............ [Open]  [Mark done] [Skip]        │
└──────────────────────────────────────────────────────────────┘
[Open] → Register panel (desktop: right pane; mobile: full-height sheet)
┌──────────────────────────────┐
│ Hack Night  1 of 5     [x]   │
│ Copy: [Sam W ⧉][sam@… ⧉]     │  ← chips: profile + this event's answers
│ [plan.wtf ⧉][Acme ⧉] …       │
│ ┌──────────────────────────┐ │
│ │  luma.com/embed/event/   │ │  ← iframe, utm_source=planwtf
│ │  evt-…/simple            │ │
│ └──────────────────────────┘ │
│ [Open on Luma ↗] [I registered ✓] [Next →] │
└──────────────────────────────┘
```

- When `luma:purchase` arrives from the active iframe: mark the event registered, show a toast, and auto-advance to the next one after 1.5 s.
- **Open on Luma ↗** (new tab, needed when the iframe fails or the user wants Apple Pay): on the next `visibilitychange` back to plan.wtf, ask "Did you finish registering for Hack Night? [Yes] [Not yet]".
- Never open several tabs or popups at once (popup blockers; one user gesture per tab).
- Profile edits in step 2 can be saved to `profiles` (opt-in checkbox). Answers are upserted into `custom_field_answers` keyed by normalized question label, so they're reused next time.

---

## 4. Components and code

New / changed (paths under `src/`):
- `components/BatchRsvpModal.tsx`: from #153. Steps `select | you | questions | review | register`. Full-screen on mobile, `max-w-3xl` on desktop.
- `components/rsvp/RegisterQueue.tsx`: rows plus statuses; polls auto jobs.
- `components/rsvp/LumaRegisterPanel.tsx`: replaces the inner part of `RsvpOverlay`. Uses the iframe `src` `https://luma.com/embed/event/{evt-id or slug}/simple?utm_source=planwtf`, copy chips, the postMessage listener, and the `visibilitychange` prompt. `RsvpOverlay` becomes a thin wrapper so single-event RSVP shares one code path.
- `lib/luma-embed.ts`: `isLumaPurchaseMessage(e, iframeEl)`. Accepts only when `e.origin ∈ {https://luma.com, https://lu.ma}`, `e.source === iframeEl.contentWindow`, and `e.data?.type === 'luma:purchase'`. Unit-tested.
- `hooks/useBatchRsvp.ts`: from #153, rewired to the new routes.
- `hooks/useRsvp.ts`:
  - Load `status, method, luma_api_id, link_key`.
  - Status type becomes `'idle' | 'confirmed' | 'pending_approval' | 'waitlist' | 'submitted' | 'failed'`.
  - Match by `event_id`, else by `link_key`, so a renamed sheet row keeps its RSVP.
  - `upsert` on `(user_id,event_id)` instead of `insert`.
  - Add `undoRsvp` for manual/embed rows.
- `components/RsvpButton.tsx`: icons/colors per status (green going, amber pending/waitlist, red failed → retry).
- `lib/luma-eligibility.ts` (pure, shared): `classifyLumaEvent(payload, connection?, settings?) → { mode: 'auto'|'finish'|'closed', reasons[], badges[], questions[], ticket }`.
- `lib/luma-form-scanner.ts`: from #153. Keep `mapQuestionToProfileField` and `mapQuestionType`; the fetch moves to `fetchLumaEvent`.
- `lib/luma-public-api.ts` (server-only, Phase 2): typed client for `public-api.luma.com`.
  - **Endpoint allowlist**: `events/get`, `events/guests/get`, `events/guests/add`, `events/ticket-types/list`, `calendars/get`, and `users/get-self` (if the key type supports it).
  - Uses `safeFetch` with a hard-coded host (8 s timeout, 1 MB cap), maps 429s to `retryAfter`, and never logs the key.
- `lib/secret-box.ts` (server-only, Phase 2): AES-256-GCM `seal/open` with key version. Key from env `LUMA_KEY_ENC_KEY_V1` (32 bytes, base64).
- `lib/types.ts`: `UserProfile += phone, website, first_name, last_name`; `LumaRegistrationQuestion` (from #153); job and status types.
- Profile editor (`UserMenu` / profile modal): add the four fields.

---

## 5. Data model / migrations

### Phase 1: `supabase/migrations/20261010120000_rsvps_v2.sql`
```sql
-- 1. Document the prod table (no-op in prod)
create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  event_id text not null,
  luma_api_id text,
  status text not null default 'confirmed',
  method text not null default 'api',
  created_at timestamptz default now(),
  unique (user_id, event_id)
);
-- 2. New columns
alter table public.rsvps
  add column if not exists conference text,
  add column if not exists link_key text,          -- normalizeEventLink(): 'luma:<slug>'
  add column if not exists detail jsonb not null default '{}',  -- e.g. {transaction_id, approval_status}
  add column if not exists updated_at timestamptz not null default now();
alter table public.rsvps alter column method set default 'manual';
-- 3. Value checks (all 4 prod rows are confirmed/manual)
alter table public.rsvps drop constraint if exists rsvps_status_check;
alter table public.rsvps add constraint rsvps_status_check
  check (status in ('confirmed','pending_approval','waitlist','submitted','declined','cancelled'));
alter table public.rsvps drop constraint if exists rsvps_method_check;
alter table public.rsvps add constraint rsvps_method_check
  check (method in ('manual','embed','host_api','luma_sync','api'));  -- 'api' = legacy default
-- 4. Cascade on account deletion
alter table public.rsvps drop constraint if exists rsvps_user_id_fkey;
alter table public.rsvps add constraint rsvps_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
-- 5. RLS: users may only self-report (manual/embed); host_api/luma_sync rows are server-written
drop policy if exists "Users can insert own rsvps" on public.rsvps;
create policy "Users can insert own rsvps" on public.rsvps for insert to authenticated
  with check (auth.uid() = user_id and method in ('manual','embed'));
drop policy if exists "Users can update own rsvps" on public.rsvps;
create policy "Users can update own rsvps" on public.rsvps for update to authenticated
  using (auth.uid() = user_id and method in ('manual','embed'))
  with check (auth.uid() = user_id and method in ('manual','embed'));
drop policy if exists "Users can delete own self-reported rsvps" on public.rsvps;
create policy "Users can delete own self-reported rsvps" on public.rsvps for delete to authenticated
  using (auth.uid() = user_id and method in ('manual','embed'));
create index if not exists rsvps_user_status on public.rsvps (user_id, status);
create index if not exists rsvps_luma_api_id on public.rsvps (luma_api_id) where luma_api_id is not null;
-- 6. Scanner cache: extra fields (luma_form_fields is empty)
alter table public.luma_form_fields
  add column if not exists calendar_api_id text,
  add column if not exists eligibility jsonb not null default '{}',  -- ticket_info, availability, requirements
  add column if not exists starts_at timestamptz;
-- 7. Record the hand-applied #153 RLS tightening
drop policy if exists "batch_rsvp_jobs_insert" on public.batch_rsvp_jobs;
drop policy if exists "batch_rsvp_jobs_update" on public.batch_rsvp_jobs;
```
Phase 1 needs no new tables. `custom_field_answers` is used as-is: the client writes its own rows under RLS.

### Phase 2: `supabase/migrations/20261020120000_auto_rsvp_hosts.sql`
```sql
create table if not exists public.luma_host_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,  -- plan.wtf host who connected
  scope text not null check (scope in ('calendar','organization')),
  luma_calendar_api_id text,             -- calendar keys
  luma_org_api_id text,                  -- org keys
  display_name text,
  key_ciphertext bytea not null, key_iv bytea not null, key_tag bytea not null,
  key_version smallint not null default 1,
  key_last4 text not null,
  auto_enable_all boolean not null default false,  -- calendar default for listed events
  default_approval text not null default 'respect_event'
    check (default_approval in ('respect_event','pending_approval','approved')),
  daily_cap int not null default 200 check (daily_cap between 1 and 5000),
  status text not null default 'active' check (status in ('active','invalid','revoked')),
  last_validated_at timestamptz, last_error text,
  created_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index if not exists luma_host_connections_one_active_cal
  on public.luma_host_connections (luma_calendar_api_id) where status = 'active' and scope = 'calendar';

create table if not exists public.luma_auto_rsvp_events (
  luma_event_api_id text primary key,
  connection_id uuid not null references public.luma_host_connections(id) on delete cascade,
  enabled boolean not null default true,
  approval_mode text check (approval_mode in ('respect_event','pending_approval','approved')), -- null = connection default
  ticket_type_id text,                   -- host-chosen free/comp ticket for plan.wtf guests
  waive_wallet boolean not null default false,
  enabled_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
-- Both tables: RLS on, NO policies, revoke all from anon, authenticated (service role only;
-- hosts manage them through /api/host/luma/*; keys never leave the server).

-- batch_rsvp_jobs (empty) becomes the auto-registration queue
alter table public.batch_rsvp_jobs drop constraint if exists batch_rsvp_jobs_status_check;
alter table public.batch_rsvp_jobs
  add column if not exists batch_id uuid,
  add column if not exists conference text,
  add column if not exists connection_id uuid references public.luma_host_connections(id) on delete set null,
  add column if not exists luma_guest_id text,
  add column if not exists approval_status text,
  add column if not exists attempts int not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists consented_at timestamptz;
alter table public.batch_rsvp_jobs alter column status set default 'queued';
alter table public.batch_rsvp_jobs add constraint batch_rsvp_jobs_status_check check (status in
  ('queued','processing','submitted','confirmed','pending_approval','waitlist',
   'already_registered','skipped','failed','cancelled'));
create unique index if not exists batch_rsvp_jobs_one_open
  on public.batch_rsvp_jobs (user_id, event_api_id)
  where status in ('queued','processing','submitted');
create index if not exists batch_rsvp_jobs_due on public.batch_rsvp_jobs (status, next_attempt_at);
```
- **PII minimization**: when a job reaches a terminal status, clear `profile_snapshot` and `custom_answers` to `'{}'`.
- **Retention**: extend `cleanup_old_tracking_data()` (or add a sibling function) to delete terminal jobs older than 30 days.
- **Revoking a connection**: zero the ciphertext columns and set `status='revoked'`. Hosts should also delete the key in Luma; the UI tells them to.

---

## 6. API routes

All use `getUserFromRequest` (bearer JWT), Zod via `parseBody`, and never accept an email or Luma URL from the client. Events are resolved server-side with `fetchEventsCached` by `(conference, eventId)`, then `getValidLumaSlug(event.link)`.

| Route | Phase | Purpose |
|---|---|---|
| `POST /api/rsvp/plan` `{conference, eventIds[≤25]}` | 1 (auto in 2) | For each event:<ol><li>Resolve the link.</li><li>Read the `luma_form_fields` cache (TTL 6 h; refresh via `fetchLumaEvent`, ≤5 parallel Luma fetches).</li><li>`classifyLumaEvent`.</li><li>Phase 2: look up the connection/settings; if auto, check `guests/get` by the user's email to detect "already registered".</li></ol>Returns `{eventId, lumaApiId, slug, mode, reasons, badges, questions, ticket, existing}`. This is #153's `scan-form`, extended and renamed. |
| `POST /api/rsvp/batch` `{conference, batchId, items[{eventId, answers{questionId: value}}], profile{first,last,company,…}, consentVersion}` | 2 | Re-classify server-side (never trust the client's mode). For `auto` items, insert `batch_rsvp_jobs` (`queued`) and process them in `after()` (Next 16): per calendar concurrency 2, then:<ol><li>`guests/get` (idempotency)</li><li>`guests/add` (`send_email:true`, approval per §7, ticket, `registration_answers`)</li><li>`guests/get` → status</li><li>upsert `rsvps` (`method='host_api'`)</li></ol>Returns job ids. Non-auto items are returned untouched for the client queue. |
| `GET /api/rsvp/batch?batchId=` | 2 | Own jobs. For `submitted` jobs older than 10 s, refresh via `guests/get` (max 1 refresh per job per 15 s). Also runs jobs that are due (`next_attempt_at <= now()`), which covers 429 retries without a cron. |
| `POST /api/rsvp/batch/[jobId]/retry` | 2 | Owner only, `failed` jobs only, max 3 attempts. |
| `GET /api/cron/rsvp-jobs` | 2 | Sweeps stuck `processing` jobs and due retries. Uses `CRON_SECRET`, same pattern as `/api/cron/geocode` (every 30 min). |
| `GET/POST/DELETE /api/host/luma/connections` | 2 | Requires ≥1 verified `event_claims` row (or a `verified_luma_hosts` row) for the caller. **POST `{apiKey}`**:<ol><li>`calendars/get` (or the org equivalent) to validate the key and read the calendar id/name.</li><li>Seal it, store it, return `{id, display_name, key_last4}`.</li></ol>**DELETE** revokes. Keys are never returned. |
| `GET /api/host/luma/events?connectionId=` | 2 | Sheet events across all conferences whose Luma `calendar_api_id` matches this connection. Each gets `events/get` (`access` must be `manage`) plus `ticket-types/list` and its auto settings. |
| `PUT /api/host/luma/events/[lumaEventApiId]` `{enabled, approvalMode, ticketTypeId, waiveWallet}` | 2 | Re-checks `access:"manage"` with the stored key before saving. Rejects paid ticket types unless the `cents=0` / comp flow is chosen. |
| `POST /api/host/luma/webhook/[connectionId]` | 3 | Luma `guest.registered` / `guest.updated`. Signing is undocumented, so the body is **only a trigger**: re-read `guests/get` with the stored key before changing any status. |

- **Self-reported RSVPs** (manual or `luma:purchase`) stay **client-side upserts under RLS** with `method in ('manual','embed')`, same as today. These rows are self-reported and are labelled that way in host analytics.
- **Firewall** (Vercel, per IP): `/api/rsvp/plan` 20/min, `/api/rsvp/batch` POST 5/min, `/api/host/luma/*` 20/min.
- **DB caps**: ≤25 events per batch, ≤100 auto jobs per user per day, and the per-connection `daily_cap`.

---

## 7. Status tracking, confirmation, and edge cases

**Status per event in `rsvps`**

| Source | How it's set | Trust |
|---|---|---|
| `host_api` | `guests/get` after add, refreshed on poll/cron/webhook. `approved` → `confirmed`; `pending_approval` / `waitlist` / `declined` map directly | Authoritative |
| `embed` | `luma:purchase` from the active iframe. Stored as `confirmed`, or `submitted` if the event `require_approval`, or `waitlist` if it was a waitlist join. `detail.transaction_id` is saved | Self-reported (documented event) |
| `manual` | "I registered" / "Already registered" buttons | Self-reported |
| `luma_sync` (Phase 3, optional) | Personal Luma iCal feed match | Medium |

Later, for connected events, a background `guests/get` can **upgrade** an `embed`/`manual` row to authoritative (e.g. detect a later host approval).

**Edge cases**
- **Paid events**: never auto unless the host chose a free/comp ticket type for plan.wtf guests (an `add-guests` call with a paid ticket would skip payment, so that's the host's explicit choice). Otherwise they go to Finish on Luma. The iframe supports card payment (`allow="payment"`), but Apple Pay is not available in embeds; show "Open on Luma ↗" for Apple Pay.
- **Approval-required events**: `respect_event` (default) means auto adds use `approval_status:'pending_approval'` when `ticket_info.require_approval` or the chosen ticket requires approval. The host can set `approved` to fast-track plan.wtf users. The UI shows "Requested · host approves".
- **Waitlists / sold out**: if `is_sold_out`/`spots_remaining=0` and `waitlist_active`, auto adds use `waitlist` (host API adds bypass capacity, so we must check capacity ourselves). With no waitlist the event is `closed` and can't be selected.
- **Already RSVP'd**:
  - A `rsvps` row exists (matched by `event_id` or `link_key`): shown under "Already RSVP'd" and not selectable.
  - Connected events: `guests/get` by email finds them and we store `already_registered` with the real status.
  - Other events: the user taps "Already registered" in the panel, which writes a manual row. The Luma iframe often shows "You're registered" if the user is signed in to Luma there.
- **Registration closed / event started / cancelled / non-event slug**: `closed` with a reason; never sent.
- **Required questions**:
  - Auto mode needs answers to every `is_required` question. Answers are validated against `options` for dropdowns. Terms questions need an explicit tick that links to `terms_content`.
  - Unanswered required questions block Next.
  - Wallet-address requirements → finish on Luma unless the host set `waive_wallet`.
- **Name requirement `first-last`**: we send `name = first + ' ' + last` (add-guests has only `name`); fine for hosts.
- **Different Luma email**: auto mode registers the **plan.wtf login email** only. The review step says so. A user who uses another email on Luma can choose "Finish on Luma" per event. A verified secondary email is a possible follow-up (§11).
- **`skipped` in the add response** (user unsubscribed or blocked by host): job `skipped`, and the event moves to the Finish queue with a note.
- **Luma 429 / 5xx**: `next_attempt_at = now()+60s`, max 3 attempts, then `failed` with a retry button.
- **Key revoked or invalid in Luma** (401/403): connection becomes `invalid` and all its queued jobs move to the Finish queue. The host sees "Reconnect" in the claim modal.
- **Event ID drift** (sheet edits change `event_id`): match `rsvps` by `link_key` / `luma_api_id`, same approach as `event_claims`.
- **Host abuse**: a host can only affect their own event, and only users who explicitly consented get added. Hosts never see other plan.wtf data.

**Confirmation strategy summary**

| Event type | Confirmation |
|---|---|
| Host-connected | Official API, authoritative |
| Not connected | Documented `luma:purchase` postMessage, then manual check-off |
| Optional (Phase 3) | iCal feed for passive background confirmation |

Email forwarding (users forwarding Luma confirmation emails to an inbound address) is **not planned**: it needs inbound-mail infra, parsing, and spoof-proofing for little gain over the two mechanisms above.

---

## 8. Mobile behavior
- The wizard is full-screen (`fixed inset-0`, safe-area padding), with sticky header/footer buttons ≥44 px. The 375 px (iPhone SE) layout is a single column.
- The Register panel reuses the `RsvpOverlay` bottom-sheet pattern: copy chips in a horizontally scrollable row above the iframe, which fills the rest of the screen.
- **iOS Safari blocks third-party cookies**, so the user is usually **not signed in to Luma inside the iframe**. They type their email (copy chip), and Luma may ask for an email code. Untested; verify on preview. If the iframe is unusable, "Open on Luma ↗" is the primary button on iOS, followed by the `visibilitychange` "Did you finish?" prompt.
- Clipboard writes happen on tap (a user gesture), so they work on iOS. If a write fails, select the text instead.
- Auto rows need no interaction. The result screen can be closed while jobs keep running server-side; status is visible later on the RSVP badges.

---

## 9. Security
- **Identity**: the registered email is always `user.email` from the verified JWT (OTP-verified). The client never sends it. Profile fields are length-capped (Zod, from #153).
- **SSRF / injection**: Luma reads use `fetchLumaEvent` (`safeFetch`, strict slug/id regexes). The public-API client uses a hard-coded host and an endpoint allowlist. No client URL is ever fetched. The iframe `src` is built only from a validated `evt-`id or slug.
- **Host API keys are full admin credentials for the calendar.**
  - Sealed with AES-256-GCM; the key lives in a Vercel env var (`LUMA_KEY_ENC_KEY_V1`) with a version column for rotation.
  - Decrypted only inside `luma-public-api.ts` for an allowlisted call. Never logged, never returned (only `last4`).
  - The tables are service-role only (RLS on, no policies, grants revoked).
  - Hosts are told to create a **dedicated key named "plan.wtf"** in Luma so they can revoke it there.
  - Alternative considered: Supabase Vault (`vault.create_secret`). Rejected for now because it would need SECURITY DEFINER RPCs around `vault.decrypted_secrets`, and it doesn't separate the encryption key from DB access. Revisit if Snax prefers it (§11).
- **Consent**: the review step lists each host/calendar receiving data. We store `consent_version` + `consented_at` per job. The privacy page gets a paragraph on auto-RSVP data sharing.
- **Kill switches**:
  - `admin_config.auto_rsvp_enabled` (global) and the env var `AUTO_RSVP_DISABLED=1`. Either turns every event into Finish-on-Luma.
  - Per-connection `status`. An admin "Disable" control in the Claims tab (Phase 2b).
- **postMessage**: we accept only the documented origin(s) **and** `e.source === activeIframe.contentWindow`. Spoofing it can only mark the user's own row as self-reported, which RLS already allows.
- **RLS**: user-writable `rsvps` rows are restricted to `manual`/`embed`, so users can't forge `host_api` rows that hosts would treat as authoritative.
- **Abuse limits**: firewall rules plus DB caps (§6). An event must exist in a sheet conference and be upcoming. Each connection respects Luma's 200 rpm with per-calendar concurrency 2 and backoff.
- **Undocumented read API**: `api.lu.ma/url` (already used by #177) is not a "publicly supported interface". Keep volume low (6 h cache, auth-only, rate-limited). For connected events, prefer `public-api` `events/get`.

---

## 10. Phased rollout (smallest shippable first)

**Phase 1: Batch "Finish on Luma" queue (~3 days, 1 PR).** Ships value with zero hosts onboarded and builds the wizard Phase 2 plugs into.
- Migration `20261010120000_rsvps_v2.sql`.
- Port the wizard + `useBatchRsvp` from #153 and add the Register step: `RegisterQueue`, `LumaRegisterPanel` (iframe + `luma:purchase` + copy chips + manual/visibility prompts).
- Refactor `RsvpOverlay` onto `LumaRegisterPanel`.
- `POST /api/rsvp/plan` (from scan-form) with `classifyLumaEvent` (modes: `finish | closed`, plus "already").
- Profile fields in the type and editor; reuse answers through `custom_field_answers`.
- `useRsvp` statuses, `link_key` matching, undo.
- Analytics: `trackRsvp({method, mode})` and wizard funnel events.

**Phase 2a: Host connection (~2 days).**
- Migration `20261020120000_auto_rsvp_hosts.sql`, `secret-box.ts`, `luma-public-api.ts`.
- `/api/host/luma/connections` and `/api/host/luma/events`.
- UI: in `ClaimEventModal` (verified state), a "Let plan.wtf users register in one tap" card: paste key → choose events / auto-enable all → approval mode → ticket type. Moves to `/host` when host-analytics Phase 2 lands.
- Ships dark: there are no attendee-facing changes yet.

**Phase 2b: Auto-registration (~3 days).**
- `classifyLumaEvent` gains `auto`; review step consent; `POST/GET /api/rsvp/batch`, retry, cron.
- RegisterQueue shows auto rows. Kill switches; admin "Disable connection".
- Behind `admin_config.auto_rsvp_enabled=false` until Snax tests with a real calendar.

**Phase 3: Confirmation and sync (~2 days, optional pieces).**
- Background `guests/get` upgrades for connected events.
- Webhooks: create on connect via `POST /v2/webhooks/create`; trigger only.
- Spike (0.5 d): personal Luma iCal feed. Find the URL format and whether it carries the Luma URL/status. If it's usable, the user pastes their feed URL; it's stored sealed, fetched via `safeFetch` with a host allowlist, and matched by event URL/UID. Status `luma_sync`.

**Phase 4: Host acquisition (~1–2 days).**
- Admin view: "Luma calendars most often in itineraries, connected or not", plus a templated outreach email.
- Public "⚡ 1-tap RSVP" badge on event cards for auto-enabled events.
- Host analytics tile "Registrations via plan.wtf" (`host_api` + `embed` + `utm_source=planwtf` in Luma insights).

Total ≈ 11–12 days. Phase 1 alone ≈ 3 days.

---

## 11. Open decisions for Snax
1. **Confirm paths 2 and 4 are out** (private register endpoint, hosted browser). Recommended: out. Appendix A lists the guardrails if you want path 2 anyway.
2. **Luma Plus for testing.** Path 1 needs a Plus calendar to test end-to-end. Buy a month for a "plan.wtf test" calendar, or recruit a friendly host?
3. **Email Luma partnerships** (in parallel with Phase 1) about (a) third parties holding host API keys and (b) an OAuth/partner client for plan.wtf (they already support Client-ID-Metadata-Document clients for MCP). A yes to (b) would replace pasted keys.
4. **Who can connect a key?** Recommended: anyone with ≥1 verified claim, with per-event authority proven by `access:"manage"`. Alternative: admin-approved hosts only.
5. **Default approval mode** for host-auto events: `respect_event` (recommended) vs. always `pending_approval`.
6. **`send_email: true`** so users get Luma's confirmation/QR (recommended), or let hosts choose.
7. **Consent UX**: one checkbox listing all hosts (recommended) or per-host checkboxes.
8. **Key storage**: app-level AES-GCM + Vercel env (recommended) or Supabase Vault.
9. **Ship Phase 1 before any host is onboarded?** Recommended: yes.
10. **iCal-feed spike** in Phase 3: yes/no.
11. **Registering with a different "Luma email"** than the login (needs OTP verification of a second email): defer?
12. **Close `tomato-78283`**: its plan shipped as #122 and this plan supersedes the rest. Suggest `/task done tomato-78283 122` and moving `plans/luma-rsvp.md` to `plans/done/` with a "superseded by sausage-24472-batch-rsvp-v2" note.

---

## 12. Risks
- **Host adoption is the whole automation story.** Luma Plus is required and many side-event hosts won't have it or won't paste a key, so most events stay on Finish-on-Luma for a while. Phase 4 exists for this.
- **Holding admin-level host keys** is a high-value secret store. Mitigations are in §9. Any leak is serious: we'd need an incident playbook to revoke all connections and email hosts to rotate their keys.
- **Undocumented behavior**:
  - Whether `luma:purchase` fires for approval-required or waitlist registrations, and whether the iframe accepts a slug (the docs use `evt-` ids, so prefer the api id from the scan).
  - Luma's in-iframe email-code step on iOS.
  - Webhook signing.
  - Verify all of these on preview and degrade to manual check-off.
- **`api.lu.ma` read endpoint** is undocumented. It could change or be rate-limited, which would hit #177 too. Cache and keep volume low.
- **Vercel cron**: `vercel.json` already runs `*/30` for geocode, so sub-daily crons work on this plan. If the project is on Hobby, poll-driven retries still cover it.
- **Conflicts**: `EventApp.tsx` is being touched by `deep-dish-69056` (React.memo) and `/itinerary` by `pineapple-22344`. Keep EventApp changes to a lazy-loaded modal and one button.

---

## 13. Test plan

**Unit tests (vitest, `src/lib/__tests__/`)**
- `luma-eligibility.test.ts`: fixtures for free, paid, approval-required, sold-out+waitlist, sold-out without waitlist, phone required, eth required, past, non-event slug, connected vs not, host ticket type chosen or not.
- `luma-form-scanner.test.ts`: `mapQuestionType` and `mapQuestionToProfileField` (port from #153).
- `luma-embed.test.ts`: origin allowlist, `source` mismatch rejected, wrong `type` rejected.
- `secret-box.test.ts`: round trip, tamper (tag/iv), wrong key version.
- `luma-public-api.test.ts` (mocked `safeFetch`):
  - endpoint allowlist enforced; key never appears in thrown errors
  - 429 → `retryAfter`
  - idempotency (`guests/get` finds the guest → no `add` call)
  - `skipped` handling
  - status mapping
- `rsvp-schemas.test.ts`: Zod caps; email cannot be supplied.

**Route tests**
- 401 without or with a bad token.
- A client-claimed `auto` mode for a non-connected event is re-classified to `finish`.
- Batch >25 → 400.
- A non-host trying to connect a key → 403.
- A key without `access:"manage"` can't enable an event.

**RLS checks** (SQL against a local/branch DB, not prod): an authenticated user can't insert `method='host_api'`, can't read `luma_host_connections`, and can't write `batch_rsvp_jobs`.

**Playwright** (`tests/`): the wizard happy path with mocked `/api/rsvp/*`, and a fake Luma iframe page that posts `luma:purchase` → row turns confirmed and the queue auto-advances. Run at 375 px and desktop.

**Vercel preview checks** (via `/ship`)
- Phase 1:
  - The real Luma iframe loads under the CSP (no `frame-src` violations in `/api/csp-report`).
  - A real free test event: `luma:purchase` is received from origin `https://luma.com`; record the payload shape.
  - "Open on Luma" + return prompt; copy chips on an iPhone (`/mobile-check`).
  - `rsvps` row created with `method='embed'`.
  - Approval-required test event: confirm what fires.
- Phase 2:
  - Connect a test Plus calendar key → event list shows `manage`.
  - Enable an event and auto-register Snax's test account → Luma confirmation email arrives, the guest appears in the Luma dashboard, and `rsvps` shows `host_api/confirmed`.
  - Approval event → `pending_approval`; approve in Luma → poll upgrades to `confirmed`.
  - Revoke the key in Luma → connection `invalid` and items fall back to Finish.
  - Kill switch flips everything to Finish.
- Regression: single-event `RsvpButton` flow, host claims flow, and `npx tsc --noEmit`, `npm run lint`, `npm test`, `next build`.

**DB rollout**: apply migrations by hand (as before), verify read-only with `information_schema`/`pg_policies` queries, then deploy the code.

---

## Appendix A: Guardrails if path 2 (private register endpoint) is ever approved
Not recommended (§2.2). If built anyway:
- A separate PR and module (`luma-unofficial.ts`) behind env `LUMA_UNOFFICIAL_REGISTER=1` **and** `admin_config.luma_unofficial_enabled`.
- Per-user opt-in with explicit copy ("uses Luma's private web endpoint; may fail or be blocked; may violate Luma's terms").
- Free events only, no approval-required events, ≤10 per user per day, ≤60 per hour globally.
- **No captcha-solving services** (that's circumvention). It must run in the user's own browser so Turnstile is solved by the user, which makes it barely better than the Finish queue.
- An auto-tripping kill switch on the first `additional-verification-required` or 403 burst.
- Separate egress from #177 verification calls if possible.
