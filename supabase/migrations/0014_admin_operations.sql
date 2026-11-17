-- Running orders day to day.
--   * orders can be cancelled (before they ship) and refunded; shipping records the courier and tracking number
--   * a payment that needed a refund can be marked refunded
--   * a design waiting for review records why the safety check sent it to a person
--   * catalogue designs can be featured (shown first)

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('paid', 'at_printer', 'shipped', 'delivered', 'cancelled'));
alter table public.orders
  add column courier text,
  add column tracking text,
  add column cancel_reason text,
  add column refunded_kes int check (refunded_kes is null or refunded_kes >= 0),
  add column refund_ref text,
  add column refunded_at timestamptz,
  add column status_changed_at timestamptz not null default now();

alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'paid', 'failed', 'expired', 'needs_refund', 'refunded'));
alter table public.payments add column refund_ref text;

alter table public.designs add column review_reason text;

alter table public.catalogue_items add column featured boolean not null default false;
