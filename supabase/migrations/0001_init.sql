-- Profiles: one row per signed-in user; is_admin is only ever set by the owners (service role / SQL).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  is_admin boolean not null default false
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create table public.designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product text not null check (product in ('tee', 'hoodie')),
  color text not null check (color in ('white', 'black')),
  size text not null check (size in ('S', 'M', 'L', 'XL')),
  layers jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'approved', 'rejected')),
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null unique references public.designs (id),
  user_id uuid not null references auth.users (id),
  status text not null default 'paid'
    check (status in ('paid', 'at_printer', 'shipped', 'delivered')),
  cost_pkr int not null,
  price_pkr int not null,
  delivery_fee_pkr int not null,
  name text not null,
  phone text not null,
  city text not null,
  province text not null,
  address text not null,
  payment_ref text not null unique,
  mockup_path text,
  design_file_path text,
  artifacts_failed boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger designs_touch before update on public.designs
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.designs enable row level security;
alter table public.orders enable row level security;

-- Customers read only their own profile; nobody but the service role can write profiles.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Customers manage only their own designs, and can only ever write status 'draft'.
-- approved / pending_review / rejected are set server-side with the service role.
create policy designs_select on public.designs for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy designs_insert on public.designs for insert to authenticated
  with check (user_id = auth.uid() and status = 'draft');
create policy designs_update on public.designs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'draft');
create policy designs_delete on public.designs for delete to authenticated
  using (user_id = auth.uid() and status = 'draft');

-- Orders are read-only for customers; created and changed only by the service role.
create policy orders_select on public.orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.profiles, public.orders to authenticated;
grant select, insert, update, delete on public.designs to authenticated;
grant all on public.profiles, public.designs, public.orders to service_role;
