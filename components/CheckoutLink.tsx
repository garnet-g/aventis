'use client';

import Link from 'next/link';
import { useCartPending } from '@/lib/cartPending';

/** The cart's Checkout button: waits while a quantity change is still being saved. */
export function CheckoutLink({ enabled }: { enabled: boolean }) {
  const saving = useCartPending();
  const on = enabled && !saving;
  return (
    <Link href="/checkout" aria-disabled={!on} tabIndex={on ? undefined : -1} className={`btn ${on ? '' : 'pointer-events-none opacity-50'}`}>
      {saving ? 'Updating your cart…' : <>Checkout &rarr;</>}
    </Link>
  );
}
