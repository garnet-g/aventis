import { Suspense } from 'react';
import { AdminsManager } from '@/components/AdminsManager';
import { supabaseAdminDirectory } from '@/lib/adminsStore';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Admins (admin)' };

export default function AdminsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
      <Admins />
    </Suspense>
  );
}

async function Admins() {
  const me = await requireAdmin();
  const admins = await supabaseAdminDirectory().list();
  return (
    <main>
      <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight">Admins</h1>
      <AdminsManager admins={admins} meId={me.id} />
    </main>
  );
}
