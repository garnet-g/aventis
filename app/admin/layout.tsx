import Link from 'next/link';
import { Suspense } from 'react';
import { requireAdmin } from '@/lib/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <nav className="mb-4 flex gap-4 border-b pb-3 text-sm font-semibold">
        <Link href="/admin/review">Review queue</Link>
        <Link href="/admin/orders">Orders</Link>
      </nav>
      <Suspense fallback={<p className="p-4 text-sm text-neutral-500">Loading…</p>}>
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
