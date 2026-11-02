-- Printing on the back of the garment.
-- A design now has two sides. `layers` stays the front; `back_layers` is the back (empty when the back is not printed).
alter table public.designs add column back_layers jsonb not null default '[]'::jsonb;

-- Orders keep their own copy of both sides, plus the extra files made for the back.
alter table public.orders
  add column back_layers_snapshot jsonb not null default '[]'::jsonb,
  add column back_mockup_path text,
  add column back_design_file_path text;

-- An order can only be created for an approved design, for exactly the layers that were approved on BOTH sides.
-- `for share` locks the design row, so a concurrent edit has to wait: the check and the insert are atomic.
create or replace function public.check_order_matches_design() returns trigger language plpgsql as $$
declare d public.designs;
begin
  select * into d from public.designs where id = new.design_id for share;
  if d.id is null
     or d.status <> 'approved'
     or d.user_id <> new.user_id
     or d.layers <> new.layers_snapshot
     or d.back_layers <> new.back_layers_snapshot then
    raise exception 'an order requires an approved design with matching layers';
  end if;
  return new;
end $$;
