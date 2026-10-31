'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PROVINCES } from '@/lib/orders';

export function CheckoutForm({ designId, totalPkr, testMode }: { designId: string; totalPkr: number; testMode: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const delivery = Object.fromEntries(['name', 'phone', 'city', 'province', 'address'].map((k) => [k, String(f.get(k) ?? '')]));
    const res = await fetch('/api/pay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ designId, delivery }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? 'Payment failed. Please try again.');
    router.push('/orders');
  }

  const field = 'rounded border p-3';
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Delivery details</h2>
      <input name="name" required placeholder="Full name" autoComplete="name" className={field} />
      <input name="phone" required placeholder="Mobile (03001234567)" inputMode="tel" autoComplete="tel" className={field} />
      <input name="city" required placeholder="City" autoComplete="address-level2" className={field} />
      <select name="province" required defaultValue="" className={field}>
        <option value="" disabled>
          Province
        </option>
        {PROVINCES.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <textarea name="address" required rows={3} placeholder="Full address" autoComplete="street-address" className={field} />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button disabled={busy} className="rounded bg-orange-600 p-3 font-semibold text-white disabled:opacity-50">
        {busy ? 'Processing…' : `Pay PKR ${totalPkr.toLocaleString('en-PK')}`}
      </button>
      {testMode && <p className="text-center text-xs text-neutral-500">TEST MODE: no real money is charged.</p>}
    </form>
  );
}
