-- Indexes for the lookups the app makes on every page view. Postgres does not index foreign keys by itself, so
-- these lists got slower with every customer: a customer's designs and orders, a checkout's orders, the review
-- queue, the admin order list, and the published catalogue.

create index if not exists designs_user_id_idx on public.designs (user_id);
create index if not exists designs_pending_review_idx on public.designs (updated_at) where status = 'pending_review';

create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_checkout_id_idx on public.orders (checkout_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

create index if not exists checkouts_user_id_idx on public.checkouts (user_id);
create index if not exists cart_items_design_id_idx on public.cart_items (design_id);

create index if not exists catalogue_items_published_idx on public.catalogue_items (created_at desc) where published;
