-- Deletes drafts untouched since p_before that were never ordered and are not in a cart, in one statement, so a
-- draft edited, added to a cart or ordered while the cleanup runs is never removed. Returns what was deleted, so
-- the caller removes only those designs' pictures. Server (service role) only.
create or replace function public.delete_stale_drafts(p_before timestamptz, p_limit int default 500)
returns table (id uuid, user_id uuid)
language sql security definer set search_path = '' as $$
  delete from public.designs d
  where d.id in (
      select x.id from public.designs x
      where x.status = 'draft' and x.updated_at < p_before
        and not exists (select 1 from public.orders o where o.design_id = x.id)
        and not exists (select 1 from public.cart_items c where c.design_id = x.id)
      order by x.updated_at
      limit p_limit
    )
    -- checked again on the row being deleted, in case it changed after the selection above
    and d.status = 'draft' and d.updated_at < p_before
    and not exists (select 1 from public.orders o where o.design_id = d.id)
    and not exists (select 1 from public.cart_items c where c.design_id = d.id)
  returning d.id, d.user_id;
$$;
revoke all on function public.delete_stale_drafts(timestamptz, int) from public, anon, authenticated;
grant execute on function public.delete_stale_drafts(timestamptz, int) to service_role;
