'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';

/** An "Admin" link in the site header, shown only to signed-in admins. Everyone else sees nothing. */
export function AdminLink() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        // customers can only read their own profile row, so this is true only for an admin's own account
        const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', data.user.id).maybeSingle();
        if (live && profile?.is_admin) setIsAdmin(true);
      } catch {
        // not signed in, or offline: no link
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return isAdmin ? (
    <Link href="/admin/orders" data-testid="admin-link" className="rounded bg-marigold px-2 py-1 text-xs font-extrabold uppercase tracking-widest text-ink hover:!bg-white hover:!text-ink">
      Admin
    </Link>
  ) : null;
}
