import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { OrderActions } from '@/components/OrderActions';
import { OrderNote } from '@/components/OrderNote';
import { canCancel, nextStatus, orderProfit, previousStatus } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { catalog, colorLabel } from '@/lib/catalog';
import { supabaseDesignStore } from '@/lib/designsStore';
import { ORDER_STATUS_LABEL, kes } from '@/lib/labels';
import { supabaseOrderNoteStore } from '@/lib/orderNotesStore';
import { supabaseOrderStore } from '@/lib/ordersStore';
import { emailForUser } from '@/lib/paymentService';
import { getServiceClient } from '@/lib/supabase/server';

export const metadata = { title: 'Order (admin)' };

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
      <OrderDetail params={params} />
    </Suspense>
  );
}

async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const order = await supabaseOrderStore().findById(id);
  if (!order) notFound();
  const design = await supabaseDesignStore().get(order.designId);
  const note = await supabaseOrderNoteStore().get(order.id);
  const next = nextStatus(order.status);
  const hasBack = order.backLayersSnapshot.length > 0;
  const filesReady =
    !order.artifactsFailed && order.mockupPath && order.designFilePath && (!hasBack || (order.backMockupPath && order.backDesignFilePath));
  const email = await emailForUser(order.userId).catch(() => null);
  // the mockups shown on the page, through short-lived private links
  const mockups = [order.mockupPath, order.backMockupPath].filter((p): p is string => Boolean(p));
  const { data: signed } = mockups.length ? await getServiceClient().storage.from('artifacts').createSignedUrls(mockups, 3600) : { data: [] };
  const pictures = (signed ?? []).map((x) => x.signedUrl).filter(Boolean) as string[];
  const placed = order.createdAt ? new Date(order.createdAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }) : '';

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Order {order.id.slice(0, 8)}</h1>
      <p className="font-semibold">Status: {ORDER_STATUS_LABEL[order.status]}</p>
      <p className="text-sm text-mute">Paid {placed}</p>
      {order.status === 'cancelled' && order.cancelReason && <p className="badge badge-red self-start">Cancelled: {order.cancelReason}</p>}
      {pictures.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {pictures.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={i === 0 ? 'Mockup, front' : 'Mockup, back'} className="w-56 rounded-lg border-2 border-ink bg-paper-2" />
          ))}
        </div>
      )}

      <section className="ticket text-sm">
        <h2 className="mb-1 font-semibold">Item</h2>
        <p>{design ? `${catalog[design.product].label} · ${colorLabel(design.color)} · size ${design.size}` : '—'}</p>
        <p className="font-semibold">Quantity: {order.quantity}</p>
        <p className="text-mute">{hasBack ? 'Printed on the front and the back' : 'Printed on the front only'}</p>
      </section>

      <section className="ticket text-sm">
        <h2 className="mb-1 font-semibold">Deliver to</h2>
        <p>
          {order.delivery.name} · {order.delivery.phone}
          {email && <> · <a className="underline" href={`mailto:${email}`}>{email}</a></>}
        </p>
        <p>
          {order.delivery.address}, {order.delivery.city}, {order.delivery.county}
        </p>
      </section>

      <section className="ticket text-sm">
        <h2 className="mb-1 font-semibold">Money</h2>
        <p>
          Customer paid: {kes(order.priceKes + order.deliveryFeeKes)} (item {kes(order.priceKes)} + delivery{' '}
          {kes(order.deliveryFeeKes)})
        </p>
        <p>Print cost: {kes(order.costKes)}</p>
        <p className="font-semibold">Profit: {kes(orderProfit(order))}</p>
        <p className="text-mute">Payment ref: {order.paymentRef}</p>
        {order.refundedKes ? (
          <p className="font-semibold text-vermilion">
            Refunded {kes(order.refundedKes)} (ref {order.refundRef})
          </p>
        ) : null}
      </section>

      {(order.courier || order.tracking) && (
        <section className="ticket text-sm">
          <h2 className="mb-1 font-semibold">Shipping</h2>
          <p>
            {order.courier} {order.tracking && <>· tracking <b>{order.tracking}</b></>}
          </p>
        </section>
      )}

      <section className="ticket text-sm">
        <h2 className="mb-2 font-semibold">Files for the printer</h2>
        {filesReady ? (
          <div className="flex flex-wrap gap-3">
            <a
              className="btn btn-ink btn-sm"
              href={`/api/admin/orders/${order.id}/download?file=mockup`}
            >
              Download mockup
            </a>
            <a
              className="btn btn-ink btn-sm"
              href={`/api/admin/orders/${order.id}/download?file=design`}
            >
              Download design file
            </a>
            {hasBack && (
              <>
                <a className="btn btn-ink btn-sm" href={`/api/admin/orders/${order.id}/download?file=back-mockup`}>
                  Download back mockup
                </a>
                <a className="btn btn-ink btn-sm" href={`/api/admin/orders/${order.id}/download?file=back-design`}>
                  Download back design file
                </a>
              </>
            )}
          </div>
        ) : (
          <p className="font-semibold text-vermilion">The files are missing. Use &ldquo;Regenerate files&rdquo;.</p>
        )}
      </section>

      <OrderNote orderId={order.id} initial={note} />

      <OrderActions
        orderId={order.id}
        next={next}
        nextLabel={next ? ORDER_STATUS_LABEL[next] : null}
        backLabel={previousStatus(order.status) ? ORDER_STATUS_LABEL[previousStatus(order.status)!] : null}
        canCancel={canCancel(order.status)}
        paidKes={order.priceKes + order.deliveryFeeKes}
        refunded={Boolean(order.refundedKes)}
        needsFiles={!filesReady}
      />
    </main>
  );
}
