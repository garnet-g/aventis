import Link from 'next/link';
import { Suspense } from 'react';
import { filterOrders, ORDER_STATUSES, orderProfit, type OrderListRow } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { ORDER_STATUS_LABEL, kes } from '@/lib/labels';
import { toOrder, type OrderRow } from '@/lib/ordersStore';
import { getServiceClient } from '@/lib/supabase/server';

type SearchParams = Promise<{ q?: string; status?: string }>;

export default function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { q = '', status = '' } = await searchParams;
  const db = getServiceClient();
  const [{ data }, { data: noteRows }] = await Promise.all([
    db.from('orders').select('*, designs(product, color, size)').order('created_at', { ascending: false }),
    db.from('order_notes').select('order_id, note'),
  ]);
  const notes = new Map((noteRows ?? []).map((n) => [n.order_id as string, n.note as string]));
  const all: (OrderListRow & { label: string })[] = (data ?? []).map((row) => {
    const order = toOrder(row as OrderRow);
    const d = (row as { designs: { product: string; color: string; size: string } | null }).designs;
    const label = d ? `${d.product} · ${d.color} · ${d.size}${order.quantity > 1 ? ` × ${order.quantity}` : ''}` : '—';
    return { order, item: label, note: notes.get(order.id) ?? '', label };
  });
  const rows = filterOrders(all, { q, status });
  const filtering = Boolean(q || status);

  return (
    <main>
      <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight">Orders</h1>
      <form method="get" className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} aria-label="Search orders" placeholder="Search name, phone, city, order, note" className="field min-w-56 flex-1" />
        <select name="status" defaultValue={status} aria-label="Status" className="field">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button className="btn btn-ink btn-sm">Search</button>
        {filtering && (
          <Link className="btn btn-quiet btn-sm" href="/admin/orders">
            Clear
          </Link>
        )}
      </form>
      {!all.length && <p className="text-mute">No orders yet.</p>}
      {all.length > 0 && !rows.length && <p data-testid="no-matches" className="text-mute">No orders match that search.</p>}
      {filtering && rows.length > 0 && <p className="mb-2 text-xs text-mute">{rows.length} of {all.length} orders</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-ink">
              <th className="p-2">Order</th>
              <th className="p-2">Item</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Status</th>
              <th className="p-2">Profit</th>
              <th className="p-2">Files</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ order, label, note }) => {
              return (
                <tr key={order.id} className="border-b border-ink/20">
                  <td className="p-2">
                    <Link className="underline" href={`/admin/orders/${order.id}`}>
                      {order.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="p-2">
                    {label}
                    {note && (
                      <span className="block max-w-48 truncate text-xs text-mute" title={note}>
                        Note: {note}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {order.delivery.name}
                    <br />
                    <span className="text-mute">{order.delivery.phone}</span>
                  </td>
                  <td className="p-2">{ORDER_STATUS_LABEL[order.status]}</td>
                  <td className="p-2">{kes(orderProfit(order))}</td>
                  <td className="p-2">
                    {order.artifactsFailed || !order.designFilePath ? (
                      <span className="font-semibold text-vermilion">Missing</span>
                    ) : (
                      'Ready'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
