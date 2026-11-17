-- Ten T-shirt colours (matching the garment photos); hoodies stay white and black until there are hoodie photos.
-- The list matches lib/garmentColors.json and catalog.hoodie.colors in lib/catalog.ts.

alter table public.designs drop constraint designs_color_check;
alter table public.designs add constraint designs_color_check
  check (color in ('black', 'white', 'grey', 'navy', 'blue', 'green', 'maroon', 'red', 'orange', 'yellow'));
alter table public.designs add constraint designs_product_color_check
  check (product = 'tee' or color in ('white', 'black'));

alter table public.catalogue_items drop constraint catalogue_items_colors_check;
alter table public.catalogue_items add constraint catalogue_items_colors_check
  check (
    cardinality(colors) between 1 and 10
    and colors <@ array['black', 'white', 'grey', 'navy', 'blue', 'green', 'maroon', 'red', 'orange', 'yellow']::text[]
    and (product = 'tee' or colors <@ array['white', 'black']::text[])
  );
