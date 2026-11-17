'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorText, json, send } from '@/lib/clientFetch';

/** "I refunded this through M-Pesa": records the refund reference for a payment that could not become an order. */
export function PaymentRefundButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const r = await send(`/api/admin/payments/${paymentId}/refunded`, json('POST', { ref }));
        setBusy(false);
        if (!r.ok) return setError(errorText(r, 'Could not save.'));
        router.refresh();
      }}
    >
      <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Refund M-Pesa ref" aria-label="Refund M-Pesa reference" required minLength={4} className="field w-40 py-1 text-xs" />
      <button disabled={busy} className="btn btn-ink btn-sm">
        Mark refunded
      </button>
      {error && <span className="text-xs font-semibold text-vermilion">{error}</span>}
    </form>
  );
}
