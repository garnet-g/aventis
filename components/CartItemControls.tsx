'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorText, json, send } from '@/lib/clientFetch';
import { MAX_QUANTITY } from '@/lib/pricing';

/** Waits this long after the last tap, so several quick taps become one request (and can't arrive out of order). */
const SETTLE_MS = 400;

/** Quantity stepper and Remove for one line of the cart. The page's totals refresh from the server after each change. */
export function CartItemControls({ designId, quantity }: { designId: string; quantity: number }) {
  const router = useRouter();
  const [qty, setQty] = useState(quantity); // shown at once; the server stays the source of truth
  const [serverQty, setServerQty] = useState(quantity);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the page refreshes with a new quantity from the server, show it (React's "adjust state on prop change").
  if (quantity !== serverQty) {
    setServerQty(quantity);
    setQty(quantity);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(next: number) {
    if (next < 1 || next > MAX_QUANTITY) return;
    setQty(next);
    setError('');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await send(`/api/cart/${designId}`, json('PUT', { quantity: next }));
      if (!r.ok) {
        setQty(serverQty);
        return setError(errorText(r, 'Could not change the quantity.'));
      }
      router.refresh();
    }, SETTLE_MS);
  }

  async function remove() {
    if (timer.current) clearTimeout(timer.current);
    setError('');
    setRemoving(true);
    const r = await send(`/api/cart/${designId}`, { method: 'DELETE' });
    setRemoving(false);
    if (!r.ok) return setError(errorText(r, 'Could not remove it.'));
    router.refresh();
  }

  const step = 'grid h-9 w-9 place-items-center rounded-[9px] border-2 border-ink text-lg font-bold disabled:opacity-40';
  return (
    <div>
      <div className="flex items-center gap-2">
        <button aria-label="Decrease quantity" className={step} disabled={qty <= 1 || removing} onClick={() => change(qty - 1)}>
          &minus;
        </button>
        <span data-testid="quantity" aria-live="polite" className="w-8 text-center font-display text-xl font-extrabold">
          {qty}
        </span>
        <button aria-label="Increase quantity" className={step} disabled={qty >= MAX_QUANTITY || removing} onClick={() => change(qty + 1)}>
          +
        </button>
        <button onClick={remove} disabled={removing} className="ml-2 text-sm underline disabled:opacity-40">
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
    </div>
  );
}
