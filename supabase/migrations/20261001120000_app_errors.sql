-- ============================================================
-- Self-hosted error monitoring: app_errors
--
-- Client errors (POST /api/errors) and server errors (onRequestError in
-- src/instrumentation.ts) are aggregated by fingerprint
-- (sha1 of source + message + first stack frame). Repeat occurrences bump
-- `count` / `last_seen` instead of inserting new rows. A recurrence of a
-- resolved error re-opens it.
--
-- Access: service role only. RLS is enabled with NO anon/authenticated
-- policies, and record_app_error() is executable only by service_role.
-- ============================================================

create table if not exists public.app_errors (
  id          uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  source      text not null check (source in ('client', 'server')),
  message     text not null,
  stack       text,
  url         text,
  route       text,
  user_agent  text,
  release     text,
  count       integer not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  resolved    boolean not null default false
);

create index if not exists app_errors_last_seen_idx
  on public.app_errors (last_seen desc);

alter table public.app_errors enable row level security;
-- (intentionally no policies: only the service role, which bypasses RLS, can read/write)

revoke all on table public.app_errors from anon, authenticated;

-- ------------------------------------------------------------
-- Atomic upsert used by src/lib/error-store.ts
-- ------------------------------------------------------------
create or replace function public.record_app_error(
  p_fingerprint text,
  p_source      text,
  p_message     text,
  p_stack       text default null,
  p_url         text default null,
  p_route       text default null,
  p_user_agent  text default null,
  p_release     text default null,
  p_count       integer default 1
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.app_errors as e (
    fingerprint, source, message, stack, url, route, user_agent, release, count
  )
  values (
    p_fingerprint,
    p_source,
    left(p_message, 500),
    left(p_stack, 4000),
    left(p_url, 500),
    left(p_route, 300),
    left(p_user_agent, 300),
    left(p_release, 64),
    greatest(coalesce(p_count, 1), 1)
  )
  on conflict (fingerprint) do update set
    count      = e.count + greatest(coalesce(p_count, 1), 1),
    last_seen  = now(),
    -- keep the latest context so the admin view reflects the newest occurrence
    url        = coalesce(excluded.url, e.url),
    route      = coalesce(excluded.route, e.route),
    user_agent = coalesce(excluded.user_agent, e.user_agent),
    release    = coalesce(excluded.release, e.release),
    stack      = coalesce(excluded.stack, e.stack),
    resolved   = false;
$$;

revoke execute on function public.record_app_error(text, text, text, text, text, text, text, text, integer) from public;
revoke execute on function public.record_app_error(text, text, text, text, text, text, text, text, integer) from anon;
revoke execute on function public.record_app_error(text, text, text, text, text, text, text, text, integer) from authenticated;
grant execute on function public.record_app_error(text, text, text, text, text, text, text, text, integer) to service_role;
