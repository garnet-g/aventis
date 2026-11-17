-- Only accounts that proved they own their email can be found (and so made admin): nobody can sign up with a
-- staff member's address first and be promoted by mistake. Production must keep email confirmations on.
create or replace function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users
  where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null and deleted_at is null
  limit 1;
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
