'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_QUANTITY } from '@/lib/pricing';

/** Quantity stepper and Remove for one line of the cart. The page's totals refresh from the server after each change. */
export function CartItemControls({ designId, quantity }: { designId: string; quantity: number }) {
  const router = useRouter();
  const [qty, setQty] = useState(quantity); // shown at once; the server stays the source of truth
  const [error, setError] = useState('');
  useEffect(() => setQty(quantity), [quantity]);

  async function change(next: number) {
    if (next < 1 || next > MAX_QUANTITY) return;
    setQty(next);
    setError('');
    const res = await fetch(`/api/cart/${designId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: next }),
    });
    if (!res.ok) {
      setQty(quantity);
      return setError((await res.json().catch(() => ({}))).error ?? 'Could not change the quantity.');
    }
    router.refresh();
  }

  async function remove() {
    setError('');
    const res = await fetch(`/api/cart/${designId}`, { method: 'DELETE' });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'Could not remove it.');
    router.refresh();
  }

  const step = 'grid h-9 w-9 place-items-center rounded-[9px] border-2 border-ink text-lg font-bold disabled:opacity-40';
  return (
    <div>
      <div className="flex items-center gap-2">
        <button aria-label="Decrease quantity" className={step} disabled={qty <= 1} onClick={() => change(qty - 1)}>
          &minus;
        </button>
        <span data-testid="quantity" aria-live="polite" className="w-8 text-center font-display text-xl font-extrabold">
          {qty}
        </span>
        <button aria-label="Increase quantity" className={step} disabled={qty >= MAX_QUANTITY} onClick={() => change(qty + 1)}>
          +
        </button>
        <button onClick={remove} className="ml-2 text-sm underline">
          Remove
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
