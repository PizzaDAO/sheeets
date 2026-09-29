-- ============================================================
-- Security hardening for aggregation / maintenance RPCs
--
-- 1. get_check_in_counts(p_user_ids uuid[])
--    Was SECURITY DEFINER and returned check-ins for ANY user ids the caller
--    passed in (anyone with the anon key could enumerate who checked in
--    where). Now only returns rows for the caller and the caller's friends,
--    and is only executable by authenticated users (the app only calls it
--    when signed in). Signature unchanged so existing clients keep working.
--
-- 2. get_reaction_summaries(p_user_id uuid)
--    Was SECURITY DEFINER (bypassing the visibility RLS on event_reactions)
--    and computed user_reacted for an arbitrary caller-supplied user id.
--    Now SECURITY INVOKER so event_reactions RLS applies (public reactions for
--    everyone, friends-only reactions for the author and their friends), and
--    user_reacted is computed for auth.uid(). p_user_id is kept for signature
--    compatibility but ignored. Still callable by anon (signed-out users see
--    public reaction counts).
--
-- 3. cleanup_old_tracking_data()
--    Pin search_path and restrict execution to service_role.
-- ============================================================

-- ------------------------------------------------------------
-- 1. get_check_in_counts
-- ------------------------------------------------------------
create or replace function public.get_check_in_counts(p_user_ids uuid[])
returns table (event_id text, checkin_count bigint, user_ids uuid[])
language sql
security definer
set search_path = public
stable
as $$
  select
    c.event_id,
    count(*)::bigint as checkin_count,
    array_agg(c.user_id) as user_ids
  from check_ins c
  where c.user_id = any(p_user_ids)
    and auth.uid() is not null
    and (
      c.user_id = auth.uid()
      or public.are_friends(auth.uid(), c.user_id)
    )
  group by c.event_id;
$$;

revoke execute on function public.get_check_in_counts(uuid[]) from public;
revoke execute on function public.get_check_in_counts(uuid[]) from anon;
grant execute on function public.get_check_in_counts(uuid[]) to authenticated;
grant execute on function public.get_check_in_counts(uuid[]) to service_role;

-- ------------------------------------------------------------
-- 2. get_reaction_summaries
-- ------------------------------------------------------------
create or replace function public.get_reaction_summaries(p_user_id uuid)
returns table (event_id text, emoji text, reaction_count bigint, user_reacted boolean)
language sql
security invoker
set search_path = public
stable
as $$
  select
    r.event_id,
    r.emoji,
    count(*)::bigint as reaction_count,
    coalesce(bool_or(r.user_id = auth.uid()), false) as user_reacted
  from event_reactions r
  group by r.event_id, r.emoji;
$$;

revoke execute on function public.get_reaction_summaries(uuid) from public;
grant execute on function public.get_reaction_summaries(uuid) to anon;
grant execute on function public.get_reaction_summaries(uuid) to authenticated;
grant execute on function public.get_reaction_summaries(uuid) to service_role;

-- ------------------------------------------------------------
-- 3. cleanup_old_tracking_data
-- ------------------------------------------------------------
alter function public.cleanup_old_tracking_data() set search_path = public;

revoke execute on function public.cleanup_old_tracking_data() from public;
revoke execute on function public.cleanup_old_tracking_data() from anon;
revoke execute on function public.cleanup_old_tracking_data() from authenticated;
grant execute on function public.cleanup_old_tracking_data() to service_role;
