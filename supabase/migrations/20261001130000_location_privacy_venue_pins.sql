-- ============================================================
-- Location privacy + venue (check-in) pins + auto check-in
--
-- 1. profiles.share_live_location (default false) and
--    profiles.auto_check_in (default false) — both opt-in.
--
-- 2. (Removed) No mass delete of existing user_locations rows. They stay
--    private: RLS only lets a user read their own row, and
--    get_friends_locations() only returns opted-in, fresh (<2h) rows.
--
-- 3. user_locations RLS: users may only insert/update their own row while
--    share_live_location is on, and may delete their own row. A trigger also
--    deletes the row server-side whenever share_live_location is turned off.
--
-- 4. get_friends_locations() replaced: only returns friends who have sharing
--    enabled AND whose location was updated in the last 2 hours. Callable by
--    authenticated users only.
--
-- 5. get_friends_active_check_ins(): friends' active (not checked out)
--    check-ins from the last 12 hours, used to show friends at the venue of
--    the event they checked in to.
--
-- 6. check_ins: users may delete their own check-ins (auto check-in "Undo").
-- ============================================================

-- ------------------------------------------------------------
-- 1. Profile settings
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists share_live_location boolean not null default false;
alter table public.profiles
  add column if not exists auto_check_in boolean not null default false;

-- ------------------------------------------------------------
-- 3. user_locations RLS + trigger
-- ------------------------------------------------------------
drop policy if exists "Users can upsert own location" on public.user_locations;
create policy "Users can upsert own location"
  on public.user_locations for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.share_live_location
    )
  );

drop policy if exists "Users can update own location" on public.user_locations;
create policy "Users can update own location"
  on public.user_locations for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.share_live_location
    )
  );

drop policy if exists "Users can delete own location" on public.user_locations;
create policy "Users can delete own location"
  on public.user_locations for delete
  using (auth.uid() = user_id);

create or replace function public.clear_location_when_sharing_disabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.share_live_location, false) = false then
    delete from public.user_locations where user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_location_when_sharing_disabled() from public;

drop trigger if exists trg_clear_location_when_sharing_disabled on public.profiles;
create trigger trg_clear_location_when_sharing_disabled
  after update of share_live_location on public.profiles
  for each row
  when (old.share_live_location is distinct from new.share_live_location)
  execute function public.clear_location_when_sharing_disabled();

-- ------------------------------------------------------------
-- 4. get_friends_locations(): opted-in + fresh only
-- ------------------------------------------------------------
create or replace function public.get_friends_locations()
returns table (user_id uuid, lat double precision, lng double precision, updated_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select ul.user_id, ul.lat, ul.lng, ul.updated_at
  from user_locations ul
  inner join profiles p
    on p.user_id = ul.user_id
   and p.share_live_location
  inner join friendships f
    on (f.user_a = auth.uid() and f.user_b = ul.user_id)
    or (f.user_b = auth.uid() and f.user_a = ul.user_id)
  where auth.uid() is not null
    and ul.updated_at > now() - interval '2 hours'
$$;

revoke execute on function public.get_friends_locations() from public;
revoke execute on function public.get_friends_locations() from anon;
grant execute on function public.get_friends_locations() to authenticated;
grant execute on function public.get_friends_locations() to service_role;

-- ------------------------------------------------------------
-- 5. get_friends_active_check_ins()
-- ------------------------------------------------------------
create or replace function public.get_friends_active_check_ins()
returns table (user_id uuid, event_id text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select c.user_id, c.event_id, c.created_at
  from check_ins c
  where auth.uid() is not null
    and c.user_id <> auth.uid()
    and c.checked_out_at is null
    and c.created_at > now() - interval '12 hours'
    and public.are_friends(auth.uid(), c.user_id)
$$;

revoke execute on function public.get_friends_active_check_ins() from public;
revoke execute on function public.get_friends_active_check_ins() from anon;
grant execute on function public.get_friends_active_check_ins() to authenticated;
grant execute on function public.get_friends_active_check_ins() to service_role;

create index if not exists idx_check_ins_created_at
  on public.check_ins(created_at);

-- ------------------------------------------------------------
-- 6. check_ins: delete own (auto check-in Undo)
-- ------------------------------------------------------------
drop policy if exists "Users can delete own check-ins" on public.check_ins;
create policy "Users can delete own check-ins"
  on public.check_ins for delete
  using (auth.uid() = user_id);
