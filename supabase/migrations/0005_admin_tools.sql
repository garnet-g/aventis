-- Admin tools.
--   * a private note on each order. It lives in its own table because customers can read their own order rows;
--     this table has no customer access at all.
--   * a settings table for the prices the owner edits on screen (also server-only).

create table public.order_notes (
  order_id uuid primary key references public.orders (id) on delete cascade,
  note text not null check (char_length(note) <= 1000),
  updated_at timestamptz not null default now()
);
alter table public.order_notes enable row level security;
grant all on public.order_notes to service_role;

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
grant all on public.settings to service_role;
