import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <nav className="mb-4 flex gap-4 border-b pb-3 text-sm font-semibold">
        <Link href="/admin/review">Review queue</Link>
        <Link href="/admin/orders">Orders</Link>
      </nav>
      {children}
    </div>
  );
}
