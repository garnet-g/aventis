'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SIZES, type Color, type Size } from '@/lib/catalog';
import { MAX_QUANTITY } from '@/lib/pricing';

const SWATCH: Record<Color, string> = { white: '#ffffff', black: '#0a0a0a' };
const LABEL: Record<Color, string> = { white: 'White', black: 'Black' };

/** The picture, colour/size/quantity pickers and the buttons on a catalogue design's page. */
export function CatalogueOrder({
  itemId,
  colors,
  previews,
  unitPriceLabel,
}: {
  itemId: string;
  colors: Color[];
  /** "<color>-<side>" -> picture link. */
  previews: Record<string, string>;
  unitPriceLabel: string;
}) {
  const router = useRouter();
  const [color, setColor] = useState<Color>(colors[0]);
  const [size, setSize] = useState<Size>('M');
  const [quantity, setQuantity] = useState(1);
  const [side, setSide] = useState<'front' | 'back'>(previews[`${colors[0]}-front`] ? 'front' : 'back');
  const [busy, setBusy] = useState<'cart' | 'customise' | null>(null);
  const [error, setError] = useState('');

  const sides = (['front', 'back'] as const).filter((s) => previews[`${color}-${s}`]);
  const shown = previews[`${color}-${side}`] ?? previews[`${color}-${sides[0]}`];

  async function send(customise: boolean) {
    setBusy(customise ? 'customise' : 'cart');
    setError('');
    const res = await fetch(`/api/catalogue/${itemId}/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ color, size, quantity, customise }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) return router.push('/login');
    setBusy(null);
    if (!res.ok) return setError(body.error ?? 'Something went wrong. Please try again.');
    router.push(customise ? `/design?d=${body.designId}` : '/cart');
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-14">
      <div className="flex w-full max-w-xl flex-col gap-3">
        <div className="overflow-hidden rounded-3xl border-2 border-ink bg-paper-2 shadow-[6px_6px_0_var(--color-marigold)]">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="The design on a garment" data-testid="catalogue-preview" className="aspect-[4/5] w-full object-contain" />
          ) : (
            <div className="grid aspect-[4/5] place-items-center text-mute">No preview</div>
          )}
        </div>
        {sides.length > 1 && (
          <div role="group" aria-label="Side" className="flex gap-2">
            {sides.map((s) => (
              <button key={s} aria-pressed={s === side} onClick={() => setSide(s)} className={`flex-1 rounded-[10px] border-2 border-ink py-2 text-sm font-bold ${s === side ? 'bg-ink text-marigold' : ''}`}>
                {s === 'front' ? 'Front' : 'Back'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <section aria-label="Colour" className="flex flex-col gap-2">
          <p className="eyebrow">Colour: {LABEL[color]}</p>
          <div className="flex gap-3">
            {colors.map((c) => (
              <button
                key={c}
                aria-label={LABEL[c]}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                className={`h-11 w-11 rounded-full border-2 border-ink ${c === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : ''}`}
                style={{ background: SWATCH[c] }}
              />
            ))}
          </div>
        </section>

        <section aria-label="Size" className="flex flex-col gap-2">
          <p className="eyebrow">Size</p>
          <div className="grid grid-cols-4 gap-3">
            {SIZES.map((s) => (
              <button
                key={s}
                aria-pressed={s === size}
                onClick={() => setSize(s)}
                className={`grid h-12 place-items-center rounded-[10px] border-2 border-ink font-bold ${s === size ? 'bg-marigold' : ''}`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Quantity" className="flex items-center gap-3">
          <p className="eyebrow">Quantity</p>
          <button aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)} className="h-10 w-10 rounded-[10px] border-2 border-ink text-xl font-bold disabled:opacity-40">
            &minus;
          </button>
          <b data-testid="quantity" className="w-8 text-center font-display text-xl">
            {quantity}
          </b>
          <button aria-label="Increase quantity" disabled={quantity >= MAX_QUANTITY} onClick={() => setQuantity(quantity + 1)} className="h-10 w-10 rounded-[10px] border-2 border-ink text-xl font-bold disabled:opacity-40">
            +
          </button>
        </section>

        <p className="text-sm text-mute">{unitPriceLabel} each, plus delivery at checkout.</p>

        {error && (
          <p role="alert" className="text-sm font-semibold text-vermilion">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-4 sm:flex-row">
          <button className="btn sm:min-w-56" disabled={busy !== null} onClick={() => void send(false)}>
            {busy === 'cart' ? 'Adding…' : 'Add to cart'}
          </button>
          <button className="btn btn-ink sm:min-w-56" disabled={busy !== null} onClick={() => void send(true)}>
            {busy === 'customise' ? 'Opening…' : 'Customise this design'}
          </button>
        </div>
      </div>
    </div>
  );
}
