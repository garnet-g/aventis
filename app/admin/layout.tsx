import Link from 'next/link';
import { Logo } from '@/components/SiteHeader';
import { Suspense } from 'react';
import { requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="bg-ink text-white">
        <nav aria-label="Admin" className="shell flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-sm font-bold [&_a:hover]:text-marigold">
          <Logo />
          <span className="rounded bg-marigold px-1.5 py-0.5 text-[0.65rem] uppercase tracking-widest text-ink">Admin</span>
          <Suspense fallback={<NavLinks />}>
            <CountedNavLinks />
          </Suspense>
        </nav>
        <div className="tape" aria-hidden />
      </div>
      <div className="shell py-8">
        <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
          <AdminGate>{children}</AdminGate>
        </Suspense>
      </div>
    </>
  );
}

/** Non-admins get a 404 before any admin content renders. */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}

function Count({ n, label }: { n: number; label: string }) {
  return n > 0 ? (
    <span data-testid={`count-${label}`} aria-label={`${n} ${label}`} className="ml-1.5 rounded-full bg-marigold px-1.5 py-0.5 text-[0.65rem] text-ink">
      {n}
    </span>
  ) : null;
}

function NavLinks({ reviews = 0, newOrders = 0 }: { reviews?: number; newOrders?: number }) {
  return (
    <>
      <Link href="/admin/review">
        Review queue
        <Count n={reviews} label="waiting for review" />
      </Link>
      <Link href="/admin/orders">
        Orders
        <Count n={newOrders} label="new orders" />
      </Link>
      <Link href="/admin/catalogue">Catalogue</Link>
      <Link href="/admin/settings">Prices</Link>
    </>
  );
}

/** Shows how many designs wait for review and how many paid orders nobody has picked up yet. */
async function CountedNavLinks() {
  await requireAdmin();
  const db = getServiceClient();
  const [reviews, newOrders] = await Promise.all([
    db.from('designs').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
  ]);
  return <NavLinks reviews={reviews.count ?? 0} newOrders={newOrders.count ?? 0} />;
}
