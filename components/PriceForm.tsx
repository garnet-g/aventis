'use client';

import { useState } from 'react';
import type { Prices } from '@/lib/prices';

type Field = { id: string; label: string; get: (p: Prices) => number; set: (p: Prices, n: number) => Prices };

const FIELDS: { group: string; fields: Field[] }[] = [
  {
    group: 'T-shirt',
    fields: [
      { id: 'tee-price', label: 'Customer pays', get: (p) => p.tee.priceKes, set: (p, n) => ({ ...p, tee: { ...p.tee, priceKes: n } }) },
      { id: 'tee-cost', label: 'Printer charges', get: (p) => p.tee.costKes, set: (p, n) => ({ ...p, tee: { ...p.tee, costKes: n } }) },
    ],
  },
  {
    group: 'Hoodie',
    fields: [
      { id: 'hoodie-price', label: 'Customer pays', get: (p) => p.hoodie.priceKes, set: (p, n) => ({ ...p, hoodie: { ...p.hoodie, priceKes: n } }) },
      { id: 'hoodie-cost', label: 'Printer charges', get: (p) => p.hoodie.costKes, set: (p, n) => ({ ...p, hoodie: { ...p.hoodie, costKes: n } }) },
    ],
  },
  {
    group: 'Printing the back too',
    fields: [
      { id: 'back-price', label: 'Customer pays extra', get: (p) => p.backPriceKes, set: (p, n) => ({ ...p, backPriceKes: n }) },
      { id: 'back-cost', label: 'Printer charges extra', get: (p) => p.backCostKes, set: (p, n) => ({ ...p, backCostKes: n }) },
    ],
  },
  { group: 'Delivery', fields: [{ id: 'delivery', label: 'Fee per checkout', get: (p) => p.deliveryFeeKes, set: (p, n) => ({ ...p, deliveryFeeKes: n }) }] },
];

/** The prices form. Values are kept as text while typing so a half-typed number is never rewritten. */
export function PriceForm({ initial }: { initial: Prices }) {
  const [saved, setSaved] = useState(initial);
  const [text, setText] = useState(() => Object.fromEntries(FIELDS.flatMap((g) => g.fields.map((f) => [f.id, String(f.get(initial))]))));
  const [rows, setRows] = useState(() => initial.bulkTiers.map((t) => ({ min: String(t.minQuantity), pct: String(t.percentOff) })));
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
    // a row left completely empty is ignored; a half-filled one is reported by the server
    const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));
    prices = { ...prices, bulkTiers: rows.filter((r) => r.min.trim() !== '' || r.pct.trim() !== '').map((r) => ({ minQuantity: num(r.min), percentOff: num(r.pct) })) };
    const res = await fetch('/api/admin/prices', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(prices),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? 'Could not save the prices.');
    setSaved(body.prices);
    setRows(body.prices.bulkTiers.map((t: { minQuantity: number; percentOff: number }) => ({ min: String(t.minQuantity), pct: String(t.percentOff) })));
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
                KES
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
      <fieldset className="ticket flex flex-col gap-2 text-sm">
        <legend className="px-1 font-display text-lg font-extrabold">Bulk prices</legend>
        <p className="text-mute">Each piece costs less when a customer orders more of the same design. Leave empty for no bulk prices.</p>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2" data-testid="bulk-row">
            <label className="flex items-center gap-1">
              Order
              <input
                aria-label={`Bulk price ${i + 1} starts at`}
                inputMode="numeric"
                value={r.min}
                onChange={(e) => {
                  setRows(rows.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)));
                  setDone(false);
                }}
                className="field w-20 text-right"
              />
              or more
            </label>
            <label className="flex items-center gap-1">
              and save
              <input
                aria-label={`Bulk price ${i + 1} percent off`}
                inputMode="numeric"
                value={r.pct}
                onChange={(e) => {
                  setRows(rows.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)));
                  setDone(false);
                }}
                className="field w-20 text-right"
              />
              %
            </label>
            <button type="button" className="underline" onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDone(false); }}>
              Remove
            </button>
          </div>
        ))}
        {rows.length < 5 && (
          <button type="button" className="btn btn-quiet btn-sm self-start" onClick={() => { setRows([...rows, { min: '', pct: '' }]); setDone(false); }}>
            Add a bulk price
          </button>
        )}
      </fieldset>
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
