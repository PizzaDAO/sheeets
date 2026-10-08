-- ============================================================
-- Host claims & Luma verification (host analytics, Phase 1)
-- See plans/host-analytics.md.
--
-- event_claims        : a user's claim to host one event (sheet event id).
-- verified_luma_hosts : a user who proved control of a Luma *host account*
--                       (verification code found in that host's Luma bio).
--                       Their future claims on Luma events listing that host
--                       auto-verify (method 'luma_host'). A code found in an
--                       event *description* only proves edit access to that
--                       one event and never creates a row here.
--
-- Access: RLS on; owners may SELECT their own rows. All writes go through API
-- routes using the service role (no insert/update/delete policies).
-- Additive and safe to apply before the code ships.
-- ============================================================

create table if not exists public.event_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,                 -- current sheet ID
  event_ids text[] not null,              -- current + historical aliases (analytics scope)
  conference text not null,
  event_name text not null,               -- snapshot
  event_link text,                        -- snapshot of sheet link
  link_key text,                          -- normalized: 'luma:<slug>' or lowercased host+path
  luma_event_api_id text,
  method text not null
    check (method in ('luma_code', 'luma_host', 'manual', 'admin_grant')),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'revoked', 'withdrawn')),
  verification_code text,
  verify_attempts int not null default 0,
  last_verify_at timestamptz,
  claimant_note text check (char_length(claimant_note) <= 1000),
  evidence jsonb not null default '{}',
  -- Luma host account proven by a host_bio match (luma_code claims), or the
  -- verified host this claim was derived from (luma_host claims).
  host_api_id text,
  -- luma_host claims: the claim whose host_bio verification granted coverage.
  -- Revoking that claim revokes this one too (see /api/admin/claims/[id]).
  derived_from_claim_id uuid references public.event_claims(id) on delete set null,
  review_note text,
  reviewed_by text,                       -- 'admin' (password auth has no user id)
  reviewed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_claims_one_open
  on public.event_claims (user_id, event_id)
  where status in ('pending', 'verified');
create index if not exists event_claims_event_ids_gin
  on public.event_claims using gin (event_ids);
create index if not exists event_claims_status
  on public.event_claims (status, created_at desc);
create index if not exists event_claims_link_key
  on public.event_claims (conference, link_key);
create index if not exists event_claims_user
  on public.event_claims (user_id, status);
create index if not exists event_claims_derived_from
  on public.event_claims (derived_from_claim_id)
  where derived_from_claim_id is not null;

alter table public.event_claims enable row level security;

drop policy if exists "own claims readable" on public.event_claims;
create policy "own claims readable" on public.event_claims
  for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policies: all writes go through API routes with the service role.

revoke insert, update, delete on table public.event_claims from anon, authenticated;
revoke all on table public.event_claims from anon;

-- ------------------------------------------------------------
-- Host-wide coverage: Luma host accounts a user has proven control of
-- ------------------------------------------------------------
create table if not exists public.verified_luma_hosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  host_api_id text not null,              -- Luma usr-… id from hosts[].api_id
  host_name text,                         -- snapshot for display
  claim_id uuid not null references public.event_claims(id) on delete cascade,
  verified_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists verified_luma_hosts_one_active
  on public.verified_luma_hosts (user_id, host_api_id)
  where revoked_at is null;
create index if not exists verified_luma_hosts_claim
  on public.verified_luma_hosts (claim_id);

alter table public.verified_luma_hosts enable row level security;

drop policy if exists "own verified hosts readable" on public.verified_luma_hosts;
create policy "own verified hosts readable" on public.verified_luma_hosts
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on table public.verified_luma_hosts from anon, authenticated;
revoke all on table public.verified_luma_hosts from anon;

-- ------------------------------------------------------------
-- updated_at maintenance
-- ------------------------------------------------------------
create or replace function public.event_claims_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists event_claims_touch_updated_at on public.event_claims;
create trigger event_claims_touch_updated_at
  before update on public.event_claims
  for each row execute function public.event_claims_touch_updated_at();

-- ------------------------------------------------------------
-- Supporting indexes for Phase 2 analytics
-- (itineraries.event_ids is text[], so a default GIN opclass applies)
-- ------------------------------------------------------------
create index if not exists idx_event_tracking_event_id_created_at
  on public.event_tracking (event_id, created_at);
create index if not exists idx_itineraries_event_ids_gin
  on public.itineraries using gin (event_ids);
