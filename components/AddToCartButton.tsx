'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorText, json, send } from '@/lib/clientFetch';

/** Puts an approved design in the cart, then goes to `href`. Used by "Pay now". */
export function AddToCartButton({ designId, label, href }: { designId: string; label: string; href: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onClick() {
    setBusy(true);
    setError('');
    const r = await send('/api/cart', json('POST', { designId }));
    if (!r.ok) {
      setBusy(false);
      return setError(errorText(r, 'Could not add it to your cart.'));
    }
    router.push(href);
  }

  return (
    <>
      <button disabled={busy} onClick={onClick} className="btn btn-sm mt-3">
        {label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
    </>
  );
}
