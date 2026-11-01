import Link from 'next/link';
import { Logo } from '@/components/SiteHeader';
import { Suspense } from 'react';
import { requireAdmin } from '@/lib/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-12">
      <nav className="mb-5 flex items-center gap-5 border-b-2 border-ink py-4 text-sm font-bold">
        <Logo />
        <Link href="/admin/review">Review queue</Link>
        <Link href="/admin/orders">Orders</Link>
      </nav>
      <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </div>
  );
}

/** Non-admins get a 404 before any admin content renders. */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
