import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Minimal stand-in for Supabase's auth schema and roles so the real migration runs unchanged.
const AUTH_STUB = `
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public, auth to anon, authenticated, service_role;
`;

export async function newDb() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(readFileSync(path.resolve('supabase/migrations/0001_init.sql'), 'utf8'));
  return db;
}

export async function addUser(db: PGlite, email: string, opts: { admin?: boolean } = {}) {
  const r = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
  const id = r.rows[0].id;
  if (opts.admin) await db.query('update profiles set is_admin = true where id = $1', [id]);
  return id;
}

/** Runs fn with the session acting as a signed-in customer (RLS applies). */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export async function insertDesign(db: PGlite, userId: string, status = 'draft') {
  const r = await db.query<{ id: string }>(
    `insert into designs (user_id, product, color, size, layers, status)
     values ($1, 'tee', 'white', 'M', '[]'::jsonb, $2) returning id`,
    [userId, status],
  );
  return r.rows[0].id;
}
