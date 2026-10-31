import Link from 'next/link';
import { orderProfit } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { ORDER_STATUS_LABEL, pkr } from '@/lib/labels';
import { toOrder, type OrderRow } from '@/lib/ordersStore';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  await requireAdmin();
  const { data } = await getServiceClient()
    .from('orders')
    .select('*, designs(product, color, size)')
    .order('created_at', { ascending: false });

  return (
    <main>
      <h1 className="mb-4 text-2xl font-bold">Orders</h1>
      {!data?.length && <p className="text-neutral-600">No orders yet.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Order</th>
              <th className="p-2">Item</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Status</th>
              <th className="p-2">Profit</th>
              <th className="p-2">Files</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((row) => {
              const order = toOrder(row as OrderRow);
              const d = (row as { designs: { product: string; color: string; size: string } | null }).designs;
              return (
                <tr key={order.id} className="border-b">
                  <td className="p-2">
                    <Link className="underline" href={`/admin/orders/${order.id}`}>
                      {order.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="p-2">{d ? `${d.product} · ${d.color} · ${d.size}` : '—'}</td>
                  <td className="p-2">
                    {order.delivery.name}
                    <br />
                    <span className="text-neutral-500">{order.delivery.phone}</span>
                  </td>
                  <td className="p-2">{ORDER_STATUS_LABEL[order.status]}</td>
                  <td className="p-2">{pkr(orderProfit(order))}</td>
                  <td className="p-2">
                    {order.artifactsFailed || !order.designFilePath ? (
                      <span className="font-semibold text-red-700">Missing</span>
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
