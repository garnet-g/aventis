-- Simple fixed-window rate limits kept in the database, so they work on any host without an extra service.
-- hit_rate_limit(key, max, window_seconds) counts one hit and says whether the caller is still within the limit.

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);
alter table public.rate_limits enable row level security;
grant all on public.rate_limits to service_role;

create function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql as $$
declare v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_max;
end $$;

revoke all on function public.hit_rate_limit(text, int, int) from public;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
