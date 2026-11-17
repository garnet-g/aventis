// Creates the two local test logins (an admin and a customer) on a LOCAL Supabase only. Safe to run again.
//   node --env-file=.env.local scripts/create-demo-accounts.mjs
// The password comes from DEMO_PASSWORD (default: demo1234). Refuses to run against anything but localhost.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) throw new Error(`Refusing to create demo accounts on ${url || 'an unknown database'}: local only.`);
const password = process.env.DEMO_PASSWORD ?? 'demo1234';
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 });
for (const [email, admin] of [['admin@vybecrew.com', true], ['customer@vybecrew.com', false]]) {
  let user = existing?.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  }
  const { error } = await db.from('profiles').upsert({ id: user.id, is_admin: admin });
  if (error) throw error;
  console.log(`${email}${admin ? ' (admin)' : ''} ready`);
}
