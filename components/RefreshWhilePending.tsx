'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Reloads the page's data every few seconds (for a payment still waiting on M-Pesa), for up to five minutes. */
export function RefreshWhilePending({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > 5 * 60_000) return clearInterval(id);
      router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
