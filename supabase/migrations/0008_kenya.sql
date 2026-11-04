-- Moving the shop to Kenya: amounts are in Kenya shillings (KES) and delivery addresses use counties.
-- Only names change here. Existing amounts are kept as they are, so re-check the prices on the Prices page.

alter table public.orders rename column cost_pkr to cost_kes;
alter table public.orders rename column price_pkr to price_kes;
alter table public.orders rename column delivery_fee_pkr to delivery_fee_kes;
alter table public.orders rename column province to county;

alter table public.checkouts rename column total_pkr to total_kes;
alter table public.checkouts rename column delivery_fee_pkr to delivery_fee_kes;

-- The prices the owner saved on screen are stored as JSON with the old key names.
update public.settings
set value = (
  replace(replace(replace(replace(replace(value::text,
    '"pricePkr"', '"priceKes"'),
    '"costPkr"', '"costKes"'),
    '"backPricePkr"', '"backPriceKes"'),
    '"backCostPkr"', '"backCostKes"'),
    '"deliveryFeePkr"', '"deliveryFeeKes"')
)::jsonb
where key = 'prices';

-- Parameter names cannot be renamed in place, so the function is replaced.
drop function public.create_checkout(uuid, text, text, int, int, jsonb, jsonb);

create function public.create_checkout(
  p_user uuid,
  p_reference text,
  p_payment_ref text,
  p_total_kes int,
  p_delivery_fee_kes int,
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
  insert into public.checkouts (user_id, reference, payment_ref, total_kes, delivery_fee_kes)
  values (p_user, p_reference, p_payment_ref, p_total_kes, p_delivery_fee_kes)
  returning id into v_checkout;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_design from public.designs where id = (v_item ->> 'design_id')::uuid for share;
    v_position := v_position + 1;
    return query
      insert into public.orders (
        design_id, user_id, checkout_id, position, quantity, cost_kes, price_kes, delivery_fee_kes,
        name, phone, city, county, address, payment_ref, layers_snapshot, back_layers_snapshot
      ) values (
        v_design.id, p_user, v_checkout, v_position, (v_item ->> 'quantity')::int,
        (v_item ->> 'cost_kes')::int, (v_item ->> 'price_kes')::int,
        case when v_position = 1 then p_delivery_fee_kes else 0 end,
        p_delivery ->> 'name', p_delivery ->> 'phone', p_delivery ->> 'city', p_delivery ->> 'county', p_delivery ->> 'address',
        p_payment_ref, v_design.layers, v_design.back_layers
      ) returning *;
  end loop;
end $$;

revoke all on function public.create_checkout(uuid, text, text, int, int, jsonb, jsonb) from public;
grant execute on function public.create_checkout(uuid, text, text, int, int, jsonb, jsonb) to service_role;
