'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';

type Who = { state: 'loading' } | { state: 'out' } | { state: 'in'; admin: boolean };

/**
 * The account end of the header: "Sign in" for visitors; "Sign out" (and "Admin" for admins) for signed-in people.
 * It runs in the browser, so pages that are otherwise the same for everyone stay prerendered.
 */
export function AccountMenu({ showAdminLink = true }: { showAdminLink?: boolean }) {
  const router = useRouter();
  const [who, setWho] = useState<Who>({ state: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getBrowserClient();
    let live = true;
    const check = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return live && setWho({ state: 'out' });
        // customers can only read their own profile row, so this is true only for an admin's own account
        const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', data.user.id).maybeSingle();
        if (live) setWho({ state: 'in', admin: Boolean(profile?.is_admin) });
      } catch {
        if (live) setWho({ state: 'out' }); // offline: offer sign-in rather than nothing
      }
    };
    void check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void check();
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    setBusy(true);
    // Only this browser: someone signing out on a shared phone shouldn't be signed out of their own laptop.
    await getBrowserClient().auth.signOut({ scope: 'local' });
    router.replace('/');
    router.refresh();
  }

  if (who.state === 'loading') return null;
  if (who.state === 'out') {
    return (
      <Link href="/login" className="rounded-lg border-2 border-marigold px-3 py-1.5 text-marigold hover:!bg-marigold hover:!text-ink">
        Sign in
      </Link>
    );
  }
  return (
    <>
      {who.admin && showAdminLink && (
        <Link href="/admin/orders" data-testid="admin-link" className="rounded bg-marigold px-2 py-1 text-xs font-extrabold uppercase tracking-widest text-ink hover:!bg-white hover:!text-ink">
          Admin
        </Link>
      )}
      <button type="button" onClick={signOut} disabled={busy} className="text-sm font-bold underline-offset-4 hover:text-marigold hover:underline disabled:opacity-50">
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </>
  );
}
