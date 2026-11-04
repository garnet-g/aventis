-- Carts and multi-item checkouts.
--   * a cart holds designs with a quantity (written only by the API, read by its owner)
--   * a checkout is one payment; it makes one order per design, all together or not at all
--   * an order now has a quantity, and its prices and cost are for all the pieces

create table public.cart_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  design_id uuid not null references public.designs (id) on delete cascade,
  quantity int not null check (quantity between 1 and 50),
  created_at timestamptz not null default now(),
  primary key (user_id, design_id)
);

alter table public.cart_items enable row level security;
create policy cart_items_select on public.cart_items for select to authenticated using (user_id = auth.uid());
grant select on public.cart_items to authenticated;
grant all on public.cart_items to service_role;

create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  -- identifies this exact cart: the same cart can only ever be paid for once
  reference text not null unique,
  -- what the payment provider answered with
  payment_ref text not null,
  total_pkr int not null,
  delivery_fee_pkr int not null,
  created_at timestamptz not null default now()
);

alter table public.checkouts enable row level security;
create policy checkouts_select on public.checkouts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
grant select on public.checkouts to authenticated;
grant all on public.checkouts to service_role;

-- The orders of one checkout share a payment reference, so it is no longer unique per order.
alter table public.orders drop constraint orders_payment_ref_key;
alter table public.orders
  add column checkout_id uuid references public.checkouts (id),
  add column quantity int not null default 1 check (quantity between 1 and 50),
  add column position int not null default 0; -- the order within its checkout, for a stable listing

-- Creates a checkout and all of its orders in one transaction. The delivery fee sits on the first order, so the
-- orders add up to exactly what was charged. Each order's snapshot is copied from its (locked) design, and the
-- trigger on orders checks the design is approved for exactly those layers.
create or replace function public.create_checkout(
  p_user uuid,
  p_reference text,
  p_payment_ref text,
  p_total_pkr int,
  p_delivery_fee_pkr int,
  p_delivery jsonb,
  p_items jsonb
) returns setof public.orders
language plpgsql as $$
declare
  v_checkout uuid;
  v_item jsonb;
  v_design public.designs;
  v_position int := 0;
begin
  insert into public.checkouts (user_id, reference, payment_ref, total_pkr, delivery_fee_pkr)
  values (p_user, p_reference, p_payment_ref, p_total_pkr, p_delivery_fee_pkr)
  returning id into v_checkout;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_design from public.designs where id = (v_item ->> 'design_id')::uuid for share;
    v_position := v_position + 1;
    return query
      insert into public.orders (
        design_id, user_id, checkout_id, position, quantity, cost_pkr, price_pkr, delivery_fee_pkr,
        name, phone, city, province, address, payment_ref, layers_snapshot, back_layers_snapshot
      ) values (
        v_design.id, p_user, v_checkout, v_position, (v_item ->> 'quantity')::int,
        (v_item ->> 'cost_pkr')::int, (v_item ->> 'price_pkr')::int,
        case when v_position = 1 then p_delivery_fee_pkr else 0 end,
        p_delivery ->> 'name', p_delivery ->> 'phone', p_delivery ->> 'city', p_delivery ->> 'province', p_delivery ->> 'address',
        p_payment_ref, v_design.layers, v_design.back_layers
      ) returning *;
  end loop;
end $$;

revoke all on function public.create_checkout(uuid, text, text, int, int, jsonb, jsonb) from public;
grant execute on function public.create_checkout(uuid, text, text, int, int, jsonb, jsonb) to service_role;
