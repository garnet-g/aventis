import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { OrderActions } from '@/components/OrderActions';
import { nextStatus, orderProfit } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { catalog } from '@/lib/catalog';
import { supabaseDesignStore } from '@/lib/designsStore';
import { ORDER_STATUS_LABEL, pkr } from '@/lib/labels';
import { supabaseOrderStore } from '@/lib/ordersStore';

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
  const next = nextStatus(order.status);
  const hasBack = order.backLayersSnapshot.length > 0;
  const filesReady =
    !order.artifactsFailed && order.mockupPath && order.designFilePath && (!hasBack || (order.backMockupPath && order.backDesignFilePath));

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Order {order.id.slice(0, 8)}</h1>
      <p className="font-semibold">Status: {ORDER_STATUS_LABEL[order.status]}</p>

      <section className="ticket text-sm">
        <h2 className="mb-1 font-semibold">Item</h2>
        <p>{design ? `${catalog[design.product].label} · ${design.color === 'white' ? 'White' : 'Black'} · size ${design.size}` : '—'}</p>
        <p className="text-mute">{hasBack ? 'Printed on the front and the back' : 'Printed on the front only'}</p>
      </section>

      <section className="ticket text-sm">
        <h2 className="mb-1 font-semibold">Deliver to</h2>
        <p>
          {order.delivery.name} · {order.delivery.phone}
        </p>
        <p>
          {order.delivery.address}, {order.delivery.city}, {order.delivery.province}
        </p>
      </section>

      <section className="ticket text-sm">
        <h2 className="mb-1 font-semibold">Money</h2>
        <p>
          Customer paid: {pkr(order.pricePkr + order.deliveryFeePkr)} (item {pkr(order.pricePkr)} + delivery{' '}
          {pkr(order.deliveryFeePkr)})
        </p>
        <p>Print cost: {pkr(order.costPkr)}</p>
        <p className="font-semibold">Profit: {pkr(orderProfit(order))}</p>
        <p className="text-mute">Payment ref: {order.paymentRef}</p>
      </section>

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

      <OrderActions orderId={order.id} nextLabel={next ? ORDER_STATUS_LABEL[next] : null} needsFiles={!filesReady} />
    </main>
  );
}
