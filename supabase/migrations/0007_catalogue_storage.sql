-- Catalogue pictures are shop-window material, so this bucket is public to read. Only the server can write to it.
insert into storage.buckets (id, name, public) values ('catalogue', 'catalogue', true)
on conflict (id) do update set public = true;
