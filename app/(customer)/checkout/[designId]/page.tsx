import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CheckoutForm } from '@/components/CheckoutForm';
import { requireUser } from '@/lib/auth';
import { catalog, DELIVERY_FEE_PKR } from '@/lib/catalog';
import { layersHash } from '@/lib/designs';
import { supabaseDesignStore } from '@/lib/designsStore';
import { getPaymentProvider } from '@/lib/payments';

const pkr = (n: number) => `PKR ${n.toLocaleString('en-PK')}`;

export default function CheckoutPage({ params }: { params: Promise<{ designId: string }> }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-neutral-500">Loading…</p>}>
      <Checkout params={params} />
    </Suspense>
  );
}

async function Checkout({ params }: { params: Promise<{ designId: string }> }) {
  const user = await requireUser();
  const { designId } = await params;
  const design = await supabaseDesignStore().get(designId);
  if (!design || design.userId !== user.id) notFound();
  // Only an approved design, approved for exactly its current layers, can reach payment.
  if (design.status !== 'approved' || design.moderatedHash !== layersHash(design.layers)) redirect('/orders');

  const product = catalog[design.product];
  const provider = getPaymentProvider();
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      {provider.isTestMode && (
        <div role="note" data-testid="test-mode-banner" className="rounded bg-yellow-200 p-3 text-center text-sm font-semibold">
          TEST MODE – no real money is charged
        </div>
      )}
      <h1 className="text-2xl font-bold">Checkout</h1>
      <section className="rounded border p-3 text-sm">
        <p className="font-semibold">
          {product.label} · {design.color === 'white' ? 'White' : 'Black'} · Size {design.size}
        </p>
        <p>Item: {pkr(product.pricePkr)}</p>
        <p>Delivery: {pkr(DELIVERY_FEE_PKR)}</p>
        <p className="mt-1 font-semibold">Total: {pkr(product.pricePkr + DELIVERY_FEE_PKR)}</p>
      </section>
      <CheckoutForm designId={design.id} totalPkr={product.pricePkr + DELIVERY_FEE_PKR} testMode={provider.isTestMode} />
    </main>
  );
}
