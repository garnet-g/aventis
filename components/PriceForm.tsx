'use client';

import { useState } from 'react';
import type { Prices } from '@/lib/prices';

type Field = { id: string; label: string; get: (p: Prices) => number; set: (p: Prices, n: number) => Prices };

const FIELDS: { group: string; fields: Field[] }[] = [
  {
    group: 'T-shirt',
    fields: [
      { id: 'tee-price', label: 'Customer pays', get: (p) => p.tee.pricePkr, set: (p, n) => ({ ...p, tee: { ...p.tee, pricePkr: n } }) },
      { id: 'tee-cost', label: 'Printer charges', get: (p) => p.tee.costPkr, set: (p, n) => ({ ...p, tee: { ...p.tee, costPkr: n } }) },
    ],
  },
  {
    group: 'Hoodie',
    fields: [
      { id: 'hoodie-price', label: 'Customer pays', get: (p) => p.hoodie.pricePkr, set: (p, n) => ({ ...p, hoodie: { ...p.hoodie, pricePkr: n } }) },
      { id: 'hoodie-cost', label: 'Printer charges', get: (p) => p.hoodie.costPkr, set: (p, n) => ({ ...p, hoodie: { ...p.hoodie, costPkr: n } }) },
    ],
  },
  {
    group: 'Printing the back too',
    fields: [
      { id: 'back-price', label: 'Customer pays extra', get: (p) => p.backPricePkr, set: (p, n) => ({ ...p, backPricePkr: n }) },
      { id: 'back-cost', label: 'Printer charges extra', get: (p) => p.backCostPkr, set: (p, n) => ({ ...p, backCostPkr: n }) },
    ],
  },
  { group: 'Delivery', fields: [{ id: 'delivery', label: 'Fee per checkout', get: (p) => p.deliveryFeePkr, set: (p, n) => ({ ...p, deliveryFeePkr: n }) }] },
];

/** The prices form. Values are kept as text while typing so a half-typed number is never rewritten. */
export function PriceForm({ initial }: { initial: Prices }) {
  const [saved, setSaved] = useState(initial);
  const [text, setText] = useState(() => Object.fromEntries(FIELDS.flatMap((g) => g.fields.map((f) => [f.id, String(f.get(initial))]))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone(false);
    let prices = saved;
    for (const g of FIELDS) for (const f of g.fields) prices = f.set(prices, text[f.id].trim() === '' ? Number.NaN : Number(text[f.id]));
    const res = await fetch('/api/admin/prices', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(prices),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? 'Could not save the prices.');
    setSaved(body.prices);
    setDone(true);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {FIELDS.map((g) => (
        <fieldset key={g.group} className="ticket flex flex-col gap-2 text-sm">
          <legend className="px-1 font-display text-lg font-extrabold">{g.group}</legend>
          {g.fields.map((f) => (
            <label key={f.id} className="flex items-center justify-between gap-3">
              {f.label}
              <span className="flex items-center gap-1">
                PKR
                <input
                  name={f.id}
                  inputMode="numeric"
                  value={text[f.id]}
                  onChange={(e) => {
                    setText({ ...text, [f.id]: e.target.value });
                    setDone(false);
                  }}
                  className="field w-28 text-right"
                />
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm font-semibold text-forest">
          Prices saved ✓
        </p>
      )}
      <button disabled={busy} className="btn btn-ink btn-sm self-start">
        {busy ? 'Saving…' : 'Save prices'}
      </button>
    </form>
  );
}
