-- Ready-made designs that the admins post and customers can order.
--   * layers / back_layers use the same shape as a customer design; image paths point into the public catalogue bucket
--   * mockups maps "<color>-front" / "<color>-back" to a preview picture in that bucket
--   * only the server (service role) reads or writes this table, so nothing unpublished is ever visible to customers

create table public.catalogue_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  product text not null check (product in ('tee', 'hoodie')),
  colors text[] not null check (cardinality(colors) between 1 and 2 and colors <@ array['white', 'black']::text[]),
  layers jsonb not null default '[]'::jsonb,
  back_layers jsonb not null default '[]'::jsonb,
  mockups jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_array_length(layers) + jsonb_array_length(back_layers) > 0)
);

create trigger catalogue_items_touch before update on public.catalogue_items
  for each row execute function public.touch_updated_at();

alter table public.catalogue_items enable row level security;
grant all on public.catalogue_items to service_role;
