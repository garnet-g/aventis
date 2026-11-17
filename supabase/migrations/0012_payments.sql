-- Payments that may take a while (M-Pesa: the customer approves a prompt on their phone, Safaricom calls back later).
-- A payment keeps its own copy of what is being bought, worked out on the server when checkout started, so the
-- orders created when the money arrives match exactly what was charged. Only the server writes here.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reference text not null,
  amount_kes int not null check (amount_kes > 0),
  delivery_fee_kes int not null check (delivery_fee_kes >= 0),
  delivery jsonb not null,
  items jsonb not null,
  phone text not null,
  provider text not null,
  request_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired', 'needs_refund')),
  provider_ref text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_user_created_idx on public.payments (user_id, created_at desc);
create index payments_status_idx on public.payments (status) where status in ('pending', 'needs_refund');

create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

alter table public.payments enable row level security;
create policy payments_select on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
