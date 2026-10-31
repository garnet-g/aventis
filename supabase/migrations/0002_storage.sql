-- Private buckets. No storage.objects policies are created for anon/authenticated, so only the
-- service role (server code) can read or write; customers and the public get signed URLs on demand.
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false), ('artifacts', 'artifacts', false)
on conflict (id) do update set public = false;
