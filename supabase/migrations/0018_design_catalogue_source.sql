-- Which catalogue design a customer's design was copied from, so ordering the same one again adds to the quantity
-- instead of making a second cart line. A plain id, not a foreign key: deleting a catalogue design must not touch
-- customers' designs (ordered ones are frozen), and an id that no longer exists simply matches nothing.
alter table public.designs add column catalogue_item_id uuid;
