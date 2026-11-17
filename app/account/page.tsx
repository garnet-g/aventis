import Link from 'next/link';
import { Suspense } from 'react';
import { ChangePassword, DeleteAccount } from '@/components/AccountControls';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';

export const metadata = { title: 'Your account', robots: { index: false } };

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<p className="shell py-10 text-sm text-mute">Loading…</p>}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const user = await requireUser('/account');
  const { data: orders } = await getServiceClient()
    .from('orders')
    .select('name, phone, city, county, address')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);
  const last = orders?.[0];
  const since = user.created_at ? new Date(user.created_at).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'long' }) : null;

  return (
    <main className="shell flex max-w-2xl flex-col gap-8 py-10">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Your account</h1>
        <p className="text-mute">
          {user.email}
          {since && <> &middot; with us since {since}</>}
        </p>
      </div>

      <section className="ticket flex flex-col gap-2" aria-labelledby="delivery-h">
        <h2 id="delivery-h" className="font-display text-xl font-extrabold">Delivery details</h2>
        {last ? (
          <>
            <p className="text-sm">
              {last.name as string}, {last.phone as string}
              <br />
              {last.address as string}, {last.city as string}, {last.county as string}
            </p>
            <p className="text-xs text-mute">From your last order. Checkout fills these in for you, and you can change them there.</p>
          </>
        ) : (
          <p className="text-sm text-mute">You haven&rsquo;t ordered yet. Your delivery details are saved with your first order.</p>
        )}
        <Link href="/orders" className="text-sm underline">
          See your orders and saved designs
        </Link>
      </section>

      <section className="ticket flex flex-col gap-2" aria-labelledby="password-h">
        <h2 id="password-h" className="font-display text-xl font-extrabold">Password</h2>
        <ChangePassword />
      </section>

      <section className="ticket flex flex-col gap-2" aria-labelledby="data-h">
        <h2 id="data-h" className="font-display text-xl font-extrabold">Your data</h2>
        <p className="text-sm">
          Download everything we hold about you: your designs, orders, payments and cart. See our <Link className="underline" href="/privacy">privacy policy</Link>.
        </p>
        <a href="/api/account/export" className="btn btn-quiet btn-sm self-start" download>
          Download my data
        </a>
      </section>

      <section className="ticket flex flex-col gap-2 border-vermilion" aria-labelledby="delete-h">
        <h2 id="delete-h" className="font-display text-xl font-extrabold">Delete your account</h2>
        <DeleteAccount hasOrders={Boolean(last)} />
      </section>
    </main>
  );
}
