'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { kes } from '@/lib/labels';
import { COUNTIES } from '@/lib/orders';

export function CheckoutForm({ totalKes, testMode }: { totalKes: number; testMode: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const delivery = Object.fromEntries(['name', 'phone', 'city', 'county', 'address'].map((k) => [k, String(f.get(k) ?? '')]));
    const res = await fetch('/api/pay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delivery }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? 'Payment failed. Please try again.');
    router.push('/orders');
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-extrabold">Delivery details</h2>
      <input name="name" required placeholder="Full name" autoComplete="name" className="field" />
      <input name="phone" required placeholder="Mobile (0712345678)" inputMode="tel" autoComplete="tel" className="field" />
      <div className="flex gap-3">
        <input name="city" required placeholder="City" autoComplete="address-level2" className="field flex-1" />
        <select name="county" required defaultValue="" className="field flex-1">
          <option value="" disabled>
            County
          </option>
          {COUNTIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <textarea name="address" required rows={3} placeholder="Full address" autoComplete="street-address" className="field" />
      {error && (
        <p role="alert" className="text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
      <button disabled={busy} className="btn mt-1">
        {busy ? 'Processing…' : `Pay ${kes(totalKes)}`}
      </button>
      {testMode && <p className="text-center text-xs text-mute">TEST MODE: no real money is charged.</p>}
    </form>
  );
}
