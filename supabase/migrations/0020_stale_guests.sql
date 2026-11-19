-- Guests (anonymous sign-ins) who designed without an account and never came back. Lists those idle since
-- p_before with no orders and no design touched since then, for the daily cleanup to delete. Server only.
create or replace function public.stale_guests(p_before timestamptz, p_limit int default 200)
returns table (id uuid)
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  where u.is_anonymous
    and greatest(u.created_at, coalesce(u.last_sign_in_at, u.created_at), coalesce(u.updated_at, u.created_at)) < p_before
    and not exists (select 1 from public.orders o where o.user_id = u.id)
    and not exists (select 1 from public.designs d where d.user_id = u.id and d.updated_at >= p_before)
  order by u.created_at
  limit p_limit;
$$;
revoke all on function public.stale_guests(timestamptz, int) from public, anon, authenticated;
grant execute on function public.stale_guests(timestamptz, int) to service_role;
