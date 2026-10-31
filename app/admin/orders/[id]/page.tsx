import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { OrderActions } from '@/components/OrderActions';
import { nextStatus, orderProfit } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { supabaseDesignStore } from '@/lib/designsStore';
import { ORDER_STATUS_LABEL, pkr } from '@/lib/labels';
import { supabaseOrderStore } from '@/lib/ordersStore';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-neutral-500">Loading…</p>}>
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
  const filesReady = !order.artifactsFailed && order.mockupPath && order.designFilePath;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Order {order.id.slice(0, 8)}</h1>
      <p className="font-semibold">Status: {ORDER_STATUS_LABEL[order.status]}</p>

      <section className="rounded border p-3 text-sm">
        <h2 className="mb-1 font-semibold">Item</h2>
        <p>{design ? `${design.product} · ${design.color} · size ${design.size}` : '—'}</p>
      </section>

      <section className="rounded border p-3 text-sm">
        <h2 className="mb-1 font-semibold">Deliver to</h2>
        <p>
          {order.delivery.name} · {order.delivery.phone}
        </p>
        <p>
          {order.delivery.address}, {order.delivery.city}, {order.delivery.province}
        </p>
      </section>

      <section className="rounded border p-3 text-sm">
        <h2 className="mb-1 font-semibold">Money</h2>
        <p>
          Customer paid: {pkr(order.pricePkr + order.deliveryFeePkr)} (item {pkr(order.pricePkr)} + delivery{' '}
          {pkr(order.deliveryFeePkr)})
        </p>
        <p>Print cost: {pkr(order.costPkr)}</p>
        <p className="font-semibold">Profit: {pkr(orderProfit(order))}</p>
        <p className="text-neutral-500">Payment ref: {order.paymentRef}</p>
      </section>

      <section className="rounded border p-3 text-sm">
        <h2 className="mb-2 font-semibold">Files for the printer</h2>
        {filesReady ? (
          <div className="flex flex-wrap gap-3">
            <a
              className="rounded bg-neutral-900 px-4 py-2 font-semibold text-white"
              href={`/api/admin/orders/${order.id}/download?file=mockup`}
            >
              Download mockup
            </a>
            <a
              className="rounded bg-neutral-900 px-4 py-2 font-semibold text-white"
              href={`/api/admin/orders/${order.id}/download?file=design`}
            >
              Download design file
            </a>
          </div>
        ) : (
          <p className="font-semibold text-red-700">The files are missing. Use &ldquo;Regenerate files&rdquo;.</p>
        )}
      </section>

      <OrderActions orderId={order.id} nextLabel={next ? ORDER_STATUS_LABEL[next] : null} needsFiles={!filesReady} />
    </main>
  );
}
