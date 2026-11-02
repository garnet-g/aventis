import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CheckoutForm } from '@/components/CheckoutForm';
import { SiteHeader } from '@/components/SiteHeader';
import { TeeArt } from '@/components/TeeArt';
import { requireUser } from '@/lib/auth';
import { BACK_PRINT_PRICE_PKR, catalog, DELIVERY_FEE_PKR } from '@/lib/catalog';
import { layersHash } from '@/lib/designs';
import { supabaseDesignStore } from '@/lib/designsStore';
import { pkr } from '@/lib/labels';
import { getPaymentProvider } from '@/lib/payments';

export default function CheckoutPage({ params }: { params: Promise<{ designId: string }> }) {
  return (
    <>
      <SiteHeader right={<span className="eyebrow">3 Pay</span>} />
      <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
        <Checkout params={params} />
      </Suspense>
    </>
  );
}

async function Checkout({ params }: { params: Promise<{ designId: string }> }) {
  const user = await requireUser();
  const { designId } = await params;
  const design = await supabaseDesignStore().get(designId);
  if (!design || design.userId !== user.id) notFound();
  // Only an approved design, approved for exactly its current layers, can reach payment.
  if (design.status !== 'approved' || design.moderatedHash !== layersHash(design.layers, design.backLayers)) redirect('/orders');

  const product = catalog[design.product];
  const provider = getPaymentProvider();
  const hasBack = design.backLayers.length > 0;
  const total = product.pricePkr + (hasBack ? BACK_PRINT_PRICE_PKR : 0) + DELIVERY_FEE_PKR;
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-12">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Checkout</h1>

      <section className="ticket mt-2">
        {provider.isTestMode && (
          <div role="note" data-testid="test-mode-banner" className="stamp">
            TEST MODE
            <span className="sr-only"> – no real money is charged</span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-16 flex-none place-items-center rounded-xl border-2 border-ink bg-paper-2">
            <TeeArt className="w-11" fill={design.color === 'black' ? '#16120f' : '#f4ecdd'} />
          </div>
          <div>
            <p className="font-display text-xl font-extrabold">{product.label}</p>
            <p className="text-sm text-mute">
              {design.color === 'white' ? 'White' : 'Black'} &middot; Size {design.size} &middot; {hasBack ? 'front and back' : 'front'}
            </p>
          </div>
        </div>
        <div className="perf" />
        <div className="flex justify-between py-0.5 text-sm">
          <span>Item</span>
          <span>{pkr(product.pricePkr)}</span>
        </div>
        {hasBack && (
          <div className="flex justify-between py-0.5 text-sm">
            <span>Back print</span>
            <span>{pkr(BACK_PRINT_PRICE_PKR)}</span>
          </div>
        )}
        <div className="flex justify-between py-0.5 text-sm">
          <span>Delivery</span>
          <span>{pkr(DELIVERY_FEE_PKR)}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-bold">Total</span>
          <span className="font-display text-2xl font-extrabold">{pkr(total)}</span>
        </div>
      </section>

      <CheckoutForm designId={design.id} totalPkr={total} testMode={provider.isTestMode} />
    </main>
  );
}
