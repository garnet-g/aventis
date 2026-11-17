import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { catalog, colorLabel, TURNAROUND } from '@/lib/catalog';
import { isNairobiArea } from '@/lib/counties';
import { supabaseDesignStore } from '@/lib/designsStore';
import { kes } from '@/lib/labels';
import { supabaseOrderStore } from '@/lib/ordersStore';
import { supabasePaymentStore } from '@/lib/paymentsStore';

export const metadata = { title: 'Thank you', robots: { index: false } };

export default function ThankYouPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <SiteHeader right={<Link href="/orders">My orders</Link>} />
      <Suspense fallback={<p className="shell py-8 text-sm text-mute">Loading…</p>}>
        <ThankYou params={params} />
      </Suspense>
    </>
  );
}

async function ThankYou({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/orders/thank-you/${id}`);
  const payment = /^[0-9a-f-]{36}$/i.test(id) ? await supabasePaymentStore().get(id) : null;
  if (!payment || payment.userId !== user.id) notFound();

  if (payment.status !== 'paid') {
    return (
      <main className="shell flex flex-col gap-4 py-10">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">{payment.status === 'pending' || payment.status === 'expired' ? 'Waiting for M-Pesa' : 'Payment not completed'}</h1>
        <p className="max-w-xl text-mute">
          {payment.status === 'needs_refund'
            ? 'Your payment arrived, but a design changed while you were paying, so we could not place the order. We will refund you through M-Pesa.'
            : payment.failureReason ?? 'We have not received this payment yet. If you paid, it will appear under My orders shortly.'}
        </p>
        <Link href="/cart" className="btn self-start">
          Back to the cart
        </Link>
      </main>
    );
  }

  const orders = (await supabaseOrderStore().findCheckoutOrders(payment.reference)) ?? [];
  const designs = supabaseDesignStore();
  const lines = await Promise.all(orders.map(async (o) => ({ order: o, design: await designs.get(o.designId) })));
  const deliveryTime = isNairobiArea(payment.delivery.county) ? TURNAROUND.nairobi : TURNAROUND.upcountry;

  return (
    <main className="shell flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Order placed</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Asante! We have your order.</h1>
        <p className="text-lg">
          We received <b>{kes(payment.amountKes)}</b>. Payment reference <b className="font-mono">{payment.providerRef}</b>.
        </p>
        <p className="text-sm text-mute">A receipt is on its way by SMS and email.</p>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ul className="grid gap-4 sm:grid-cols-2">
          {lines.map(({ order, design }) => (
            <li key={order.id} className="ticket flex gap-3" data-testid="thank-you-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/designs/${order.designId}/preview`} alt="Your design" className="h-32 w-[6.4rem] flex-none rounded-lg border-2 border-ink bg-paper-2 object-cover" />
              <div className="text-sm">
                <p className="font-display text-lg font-extrabold">{design ? catalog[design.product].label : 'Item'}</p>
                {design && (
                  <p className="text-mute">
                    {colorLabel(design.color)} &middot; Size {design.size}
                    {design.backLayers.length ? ' · front and back' : ''}
                  </p>
                )}
                <p>Quantity {order.quantity}</p>
                <p className="mt-1 font-mono text-xs">Order {order.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </li>
          ))}
        </ul>

        <aside className="flex flex-col gap-4">
          <section className="ticket text-sm">
            <h2 className="mb-1 font-display text-lg font-extrabold">Delivering to</h2>
            <p>
              {payment.delivery.name} &middot; {payment.delivery.phone}
            </p>
            <p>
              {payment.delivery.address}, {payment.delivery.city}, {payment.delivery.county}
            </p>
          </section>
          <section className="ticket text-sm">
            <h2 className="mb-1 font-display text-lg font-extrabold">What happens next</h2>
            <ol className="list-decimal pl-5">
              <li>We print your order: {TURNAROUND.printing}.</li>
              <li>We send it to you: {deliveryTime}. You get an SMS when it ships.</li>
            </ol>
          </section>
          <Link href="/orders" className="btn">
            Follow my orders
          </Link>
        </aside>
      </div>
    </main>
  );
}
