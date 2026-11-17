'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { catalog, colorHex, colorLabel, COLORS, type ProductId } from '@/lib/catalog';
import { errorText, send } from '@/lib/clientFetch';

/** The form that posts a new design to the catalogue. */
export function CatalogueForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [product, setProduct] = useState<ProductId>('tee');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone(false);
    const r = await send('/api/admin/catalogue', { method: 'POST', body: new FormData(e.currentTarget) });
    setBusy(false);
    if (!r.ok) return setError(errorText(r, 'Could not post the design.'));
    formRef.current?.reset();
    setDone(true);
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={submit} className="ticket flex flex-col gap-4" aria-label="Post a design">
      <h2 className="font-display text-2xl font-extrabold">Post a new design</h2>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Title
        <input name="title" required minLength={2} maxLength={80} className="field font-normal" placeholder="e.g. Midnight Crew" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Description (optional)
        <textarea name="description" rows={2} maxLength={500} className="field font-normal" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Item
          <select name="product" className="field font-normal" value={product} onChange={(e) => setProduct(e.target.value as ProductId)}>
            <option value="tee">T-shirt</option>
            <option value="hoodie">Hoodie</option>
          </select>
        </label>
        <fieldset className="flex flex-col gap-1 text-sm font-bold">
          <legend className="mb-1">Garment colours it looks right on</legend>
          {/* keyed by item, so switching item resets the ticks to that item's colours */}
          <div key={product} className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-normal">
            {catalog[product].colors.map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input type="checkbox" name="colors" value={c} defaultChecked={c === 'white' || c === 'black'} />
                <span aria-hidden className="h-3.5 w-3.5 flex-none rounded-full border border-ink" style={{ background: colorHex(c) }} />
                {colorLabel(c)}
              </label>
            ))}
          </div>
          {catalog[product].colors.length < COLORS.length && <p className="text-xs font-normal text-mute">Hoodies come in white and black for now.</p>}
        </fieldset>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Front picture (PNG, JPG or WebP)
          <input name="front" type="file" accept="image/png,image/jpeg,image/webp" className="field font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Back picture (optional)
          <input name="back" type="file" accept="image/png,image/jpeg,image/webp" className="field font-normal" />
        </label>
      </div>
      <p className="text-xs text-mute">The picture is centred in the print area as large as it fits. A transparent PNG works best. New designs start hidden: publish them when they look right.</p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm font-semibold">
          Posted. Check the preview below, then publish it.
        </p>
      )}
      <button disabled={busy} className="btn self-start">
        {busy ? 'Posting…' : 'Post design'}
      </button>
    </form>
  );
}

/** Publish / hide and delete buttons for one catalogue design. */
export function CatalogueRowActions({ id, published, title }: { id: string; published: boolean; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function call(init: RequestInit) {
    setBusy(true);
    setError('');
    const r = await send(`/api/admin/catalogue/${id}`, init);
    setBusy(false);
    if (!r.ok) return setError(errorText(r, 'That did not work.'));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          className={`btn btn-sm ${published ? 'btn-quiet' : ''}`}
          onClick={() => void call({ method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ published: !published }) })}
        >
          {published ? 'Hide' : 'Publish'}
        </button>
        <button
          disabled={busy}
          aria-label={`Delete ${title}`}
          className="btn btn-sm btn-quiet border-vermilion text-vermilion"
          onClick={() => confirm(`Delete "${title}"? Orders already placed are not affected.`) && void call({ method: 'DELETE' })}
        >
          Delete
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
    </div>
  );
}
