import Link from 'next/link';
import { Suspense } from 'react';
import { CartItemControls } from '@/components/CartItemControls';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { catalog } from '@/lib/catalog';
import { loadCart } from '@/lib/cart';
import { supabaseCartStore } from '@/lib/cartStore';
import { supabaseDesignStore } from '@/lib/designsStore';
import { pkr } from '@/lib/labels';

export default function CartPage() {
  return (
    <>
      <SiteHeader right={<Link href="/orders">My prints</Link>} />
      <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
        <Cart />
      </Suspense>
    </>
  );
}

async function Cart() {
  const user = await requireUser();
  const cart = await loadCart({ designs: supabaseDesignStore(), cart: supabaseCartStore() }, user.id);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-12">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Your cart</h1>

      {cart.lines.length === 0 ? (
        <p className="text-mute">
          Your cart is empty. <Link className="underline" href="/design">Start a design</Link>.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {cart.lines.map((l) => (
              <li key={l.designId} data-testid="cart-line" className="ticket">
                <div className="flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/designs/${l.designId}/preview`}
                    alt="Your design"
                    className="h-28 w-[5.6rem] flex-none rounded-lg border-2 border-ink bg-paper-2 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-extrabold">{catalog[l.design.product].label}</p>
                    <p className="text-sm text-mute">
                      {l.design.color === 'white' ? 'White' : 'Black'} &middot; Size {l.design.size}
                      {l.design.backLayers.length > 0 ? ' · front and back' : ''}
                    </p>
                    <p className="text-sm">{pkr(l.unitPricePkr)} each</p>
                    {l.problem && <p className="badge badge-gold mt-2">{l.problem}</p>}
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <CartItemControls designId={l.designId} quantity={l.quantity} />
                  <b className="font-display text-xl">{pkr(l.pricePkr)}</b>
                </div>
              </li>
            ))}
          </ul>

          <section className="ticket text-sm">
            <div className="flex justify-between py-0.5">
              <span>Items</span>
              <span>{pkr(cart.subtotalPkr)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Delivery</span>
              <span>{pkr(cart.deliveryFeePkr)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-bold">Total</span>
              <span data-testid="cart-total" className="font-display text-2xl font-extrabold">
                {pkr(cart.totalPkr)}
              </span>
            </div>
          </section>

          <Link
            href="/checkout"
            aria-disabled={!cart.canCheckout}
            tabIndex={cart.canCheckout ? undefined : -1}
            className={`btn ${cart.canCheckout ? '' : 'pointer-events-none opacity-50'}`}
          >
            Checkout &rarr;
          </Link>
          {!cart.canCheckout && <p className="text-center text-sm font-semibold text-vermilion">Fix the items marked above to continue.</p>}
          <Link className="text-center text-sm underline" href="/design">
            Add another design
          </Link>
        </>
      )}
    </main>
  );
}
