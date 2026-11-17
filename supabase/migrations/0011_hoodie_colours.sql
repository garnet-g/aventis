-- Hoodies now have photos in every colour except orange (lib/catalog.ts: catalog.hoodie.colors).

alter table public.designs drop constraint designs_product_color_check;
alter table public.designs add constraint designs_product_color_check
  check (product = 'tee' or color <> 'orange');

alter table public.catalogue_items drop constraint catalogue_items_colors_check;
alter table public.catalogue_items add constraint catalogue_items_colors_check
  check (
    cardinality(colors) between 1 and 10
    and colors <@ array['black', 'white', 'grey', 'navy', 'blue', 'green', 'maroon', 'red', 'orange', 'yellow']::text[]
    and (product = 'tee' or not ('orange' = any (colors)))
  );
