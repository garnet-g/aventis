import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CheckoutForm } from '@/components/CheckoutForm';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { catalog, colorLabel } from '@/lib/catalog';
import { loadCart } from '@/lib/cart';
import { supabasePriceStore } from '@/lib/pricesStore';
import { supabaseCartStore } from '@/lib/cartStore';
import { supabaseDesignStore } from '@/lib/designsStore';
import { kes } from '@/lib/labels';
import { getPaymentProvider } from '@/lib/payments';
import { getServiceClient } from '@/lib/supabase/server';

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
  const user = await requireUser('/checkout');
  const prices = await supabasePriceStore().get();
  const cart = await loadCart({ designs: supabaseDesignStore(), cart: supabaseCartStore(), prices }, user.id);
  // Only a cart whose designs are all approved, exactly as they are now, can be paid for.
  if (!cart.canCheckout) redirect('/cart');
  const provider = getPaymentProvider();
  // The last order's delivery details, so a returning customer doesn't type them again.
  const { data: last } = await getServiceClient().from('orders').select('name, phone, city, county, address').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1);
  const saved = last?.[0] ? { name: last[0].name as string, phone: last[0].phone as string, city: last[0].city as string, county: last[0].county as string, address: last[0].address as string } : null;

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
                  {colorLabel(l.design.color)} &middot; Size {l.design.size} &middot;{' '}
                  {l.design.backLayers.length > 0 ? 'front and back' : 'front'}
                </span>
              </span>
              <span>{kes(l.priceKes)}</span>
            </li>
          ))}
        </ul>
        <div className="perf" />
        {cart.lines.some((l) => l.design.backLayers.length > 0) && (
          <p className="pb-1 text-xs text-mute">Back print is included in the prices above.</p>
        )}
        <div className="flex justify-between py-0.5 text-sm">
          <span>Items</span>
          <span>{kes(cart.subtotalKes)}</span>
        </div>
        <div className="flex justify-between gap-3 py-0.5 text-sm">
          <span>Delivery</span>
          <span className="text-right">
            {kes(prices.deliveryFeeKes)} Nairobi area
            <br />
            {kes(prices.deliveryFeeUpcountryKes)} rest of Kenya
          </span>
        </div>
        <p className="mt-1 text-xs text-mute">The total for your county is on the Pay button.</p>
      </section>

      <div className="lg:order-1">
        <CheckoutForm
          subtotalKes={cart.subtotalKes}
          deliveryNairobiKes={prices.deliveryFeeKes}
          deliveryUpcountryKes={prices.deliveryFeeUpcountryKes}
          testMode={provider.isTestMode}
          mpesa={provider.name === 'mpesa'}
          saved={saved}
        />
      </div>
      </div>
    </main>
  );
}
