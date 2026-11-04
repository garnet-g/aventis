import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CheckoutForm } from '@/components/CheckoutForm';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { catalog } from '@/lib/catalog';
import { loadCart } from '@/lib/cart';
import { supabasePriceStore } from '@/lib/pricesStore';
import { supabaseCartStore } from '@/lib/cartStore';
import { supabaseDesignStore } from '@/lib/designsStore';
import { pkr } from '@/lib/labels';
import { getPaymentProvider } from '@/lib/payments';

export default function CheckoutPage() {
  return (
    <>
      <SiteHeader right={<span className="eyebrow">3 Pay</span>} />
      <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
        <Checkout />
      </Suspense>
    </>
  );
}

async function Checkout() {
  const user = await requireUser();
  const cart = await loadCart({ designs: supabaseDesignStore(), cart: supabaseCartStore(), prices: await supabasePriceStore().get() }, user.id);
  // Only a cart whose designs are all approved, exactly as they are now, can be paid for.
  if (!cart.canCheckout) redirect('/cart');
  const provider = getPaymentProvider();

  return (
    <main className="shell flex flex-col gap-6 py-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Checkout</h1>

      <div className="grid items-start gap-8 lg:grid-cols-2">
      <section className="ticket mt-2 lg:order-2">
        {provider.isTestMode && (
          <div role="note" data-testid="test-mode-banner" className="stamp">
            TEST MODE
            <span className="sr-only"> – no real money is charged</span>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {cart.lines.map((l) => (
            <li key={l.designId} className="flex items-start justify-between gap-3 text-sm">
              <span>
                <b className="font-display text-base font-extrabold">
                  {catalog[l.design.product].label}
                  {l.quantity > 1 ? ` × ${l.quantity}` : ''}
                </b>
                <br />
                <span className="text-mute">
                  {l.design.color === 'white' ? 'White' : 'Black'} &middot; Size {l.design.size} &middot;{' '}
                  {l.design.backLayers.length > 0 ? 'front and back' : 'front'}
                </span>
              </span>
              <span>{pkr(l.pricePkr)}</span>
            </li>
          ))}
        </ul>
        <div className="perf" />
        {cart.lines.some((l) => l.design.backLayers.length > 0) && (
          <p className="pb-1 text-xs text-mute">Back print is included in the prices above.</p>
        )}
        <div className="flex justify-between py-0.5 text-sm">
          <span>Delivery</span>
          <span>{pkr(cart.deliveryFeePkr)}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-bold">Total</span>
          <span className="font-display text-2xl font-extrabold">{pkr(cart.totalPkr)}</span>
        </div>
      </section>

      <div className="lg:order-1">
        <CheckoutForm totalPkr={cart.totalPkr} testMode={provider.isTestMode} />
      </div>
      </div>
    </main>
  );
}
