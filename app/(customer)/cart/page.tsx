import Link from 'next/link';
import { Suspense } from 'react';
import { CartItemControls } from '@/components/CartItemControls';
import { SiteHeader } from '@/components/SiteHeader';
import { currentUser } from '@/lib/auth';
import { catalog, colorLabel } from '@/lib/catalog';
import { loadCart } from '@/lib/cart';
import { supabasePriceStore } from '@/lib/pricesStore';
import { supabaseCartStore } from '@/lib/cartStore';
import { supabaseDesignStore } from '@/lib/designsStore';
import { CheckoutLink } from '@/components/CheckoutLink';
import { kes, printedSides } from '@/lib/labels';

export const metadata = { title: 'Your cart' };

export default function CartPage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
        <Cart />
      </Suspense>
    </>
  );
}

async function Cart() {
  const user = await currentUser();
  if (!user) {
    return (
      <main className="shell flex flex-col gap-6 py-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Your cart</h1>
        <p className="text-mute">
          Your cart is empty. <Link className="underline" href="/design" prefetch={false}>Start a design</Link> or <Link className="underline" href="/catalogue">pick one from the catalogue</Link>.
        </p>
      </main>
    );
  }
  const cart = await loadCart({ designs: supabaseDesignStore(), cart: supabaseCartStore(), prices: await supabasePriceStore().get() }, user.id);

  return (
    <main className="shell flex flex-col gap-6 py-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Your cart</h1>

      {cart.lines.length === 0 ? (
        <p className="text-mute">
          Your cart is empty. <Link className="underline" href="/design" prefetch={false}>Start a design</Link>.
        </p>
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <ul className="flex flex-col gap-4">
            {cart.lines.map((l) => (
              <li key={l.designId} data-testid="cart-line" className="ticket">
                <div className="flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/designs/${l.designId}/preview?v=${encodeURIComponent(l.design.version)}`}
                    alt="Your design"
                    className="h-28 w-[5.6rem] flex-none sm:h-36 sm:w-28 rounded-lg border-2 border-ink bg-paper-2 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-extrabold">{catalog[l.design.product].label}</p>
                    <p className="text-sm text-mute">
                      {colorLabel(l.design.color)} &middot; Size {l.design.size} &middot; printed on the {printedSides(l.design)}
                    </p>
                    <p className="text-sm">
                      {l.bulkPercentOff > 0 && <s className="mr-1.5 text-mute">{kes(l.listUnitPriceKes)}</s>}
                      {kes(l.unitPriceKes)} each
                    </p>
                    {l.bulkPercentOff > 0 && (
                      <p data-testid="bulk-badge" className="badge badge-gold mt-1">
                        Bulk price: {l.bulkPercentOff}% off
                      </p>
                    )}
                    {l.problem && <p className="badge badge-gold mt-2">{l.problem}</p>}
                    {l.needsRecheck && (
                      <Link href={`/design?d=${l.designId}`} prefetch={false} className="mt-2 block text-sm font-bold underline">
                        Open it and check again
                      </Link>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <CartItemControls designId={l.designId} quantity={l.quantity} />
                  <b className="font-display text-xl">{kes(l.priceKes)}</b>
                </div>
              </li>
            ))}
          </ul>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <section className="ticket text-sm">
            <div className="flex justify-between py-0.5">
              <span>Items</span>
              <span>{kes(cart.subtotalKes)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Delivery, Nairobi area</span>
              <span>{kes(cart.deliveryFeeKes)}</span>
            </div>
            <p className="text-xs text-mute">Rest of Kenya: {kes(cart.upcountryFeeKes)}. You choose your county at checkout.</p>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-bold">Total</span>
              <span data-testid="cart-total" className="font-display text-2xl font-extrabold">
                {kes(cart.totalKes)}
              </span>
            </div>
          </section>

          <CheckoutLink enabled={cart.canCheckout} />
          {!cart.canCheckout && <p className="text-center text-sm font-semibold text-vermilion">Fix the items marked above to continue.</p>}
          <Link className="text-center text-sm underline" href="/design" prefetch={false}>
            Add another design
          </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
