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
  moderated_hash text,
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
  layers_snapshot jsonb not null default '[]'::jsonb, -- copy of the paid design; artifacts are always rendered from this
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

-- Customers read only their own designs; admins read all. There are no customer write policies:
-- every write goes through the API with the service role.
create policy designs_select on public.designs for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Orders are read-only for customers; created and changed only by the service role.
create policy orders_select on public.orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Once a design has an order it is frozen for EVERY role (the service role included): the order's snapshot
-- and the design can never drift apart. Nothing in fulfilment needs to edit a design.
create function public.block_edit_after_order() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.orders where design_id = old.id) then
    raise exception 'design % already has an order and cannot be changed', old.id;
  end if;
  return coalesce(new, old);
end $$;

-- An order can only be created for an approved design, for exactly the layers that were approved.
-- `for share` locks the design row, so a concurrent edit has to wait: the check and the insert are atomic.
create function public.check_order_matches_design() returns trigger language plpgsql as $$
declare d public.designs;
begin
  select * into d from public.designs where id = new.design_id for share;
  if d.id is null or d.status <> 'approved' or d.user_id <> new.user_id or d.layers <> new.layers_snapshot then
    raise exception 'an order requires an approved design with matching layers';
  end if;
  return new;
end $$;

create trigger orders_check_design before insert on public.orders
  for each row execute function public.check_order_matches_design();

create trigger designs_block_edit_after_order before update or delete on public.designs
  for each row execute function public.block_edit_after_order();

grant select on public.profiles, public.orders to authenticated;
-- Customers can only READ designs. Every write (create, edit, moderation result) goes through the API with the
-- service role, so layers and upload paths are always validated by server code first.
grant select on public.designs to authenticated;
grant all on public.profiles, public.designs, public.orders to service_role;
