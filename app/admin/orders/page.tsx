import Link from 'next/link';
import { Suspense } from 'react';
import { ORDER_STATUSES, orderProfit } from '@/lib/admin';
import { PAGE_SIZE, queryAdminOrders } from '@/lib/adminOrders';
import { requireAdmin } from '@/lib/auth';
import { catalog, colorLabel } from '@/lib/catalog';
import { ORDER_STATUS_LABEL, kes } from '@/lib/labels';
import { getServiceClient } from '@/lib/supabase/server';

export const metadata = { title: 'Orders (admin)' };

type SearchParams = Promise<{ q?: string; status?: string; from?: string; to?: string; page?: string }>;

export default function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

async function Orders({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { q = '', status = '', from = '', to = '', page: pageParam = '1' } = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(pageParam, 10) || 1));
  const { rows, total } = await queryAdminOrders({ q, status, from, to }, { offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
  // the saved mockups (private files) through short-lived links, instead of drawing 50 previews
  const paths = rows.map((r) => r.order.mockupPath).filter((p): p is string => Boolean(p));
  const { data: signed } = paths.length ? await getServiceClient().storage.from('artifacts').createSignedUrls(paths, 3600) : { data: [] };
  const thumb = new Map((signed ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]));
  const filtering = Boolean(q || status || from || to);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = (extra: Record<string, string>) => new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(from && { from }), ...(to && { to }), ...extra }).toString();

  return (
    <main>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Orders</h1>
        <a className="btn btn-quiet btn-sm" href={`/api/admin/orders/export?${query({})}`}>
          Export CSV
        </a>
      </div>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <input name="q" defaultValue={q} aria-label="Search orders" placeholder="Search name, phone, town, order, note, tracking" className="field min-w-56 flex-1" />
        <select name="status" defaultValue={status} aria-label="Status" className="field">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="flex flex-col text-xs font-bold">
          From
          <input type="date" name="from" defaultValue={from} className="field font-normal" />
        </label>
        <label className="flex flex-col text-xs font-bold">
          To
          <input type="date" name="to" defaultValue={to} className="field font-normal" />
        </label>
        <button className="btn btn-ink btn-sm">Search</button>
        {filtering && (
          <Link className="btn btn-quiet btn-sm" href="/admin/orders">
            Clear
          </Link>
        )}
      </form>
      {!total && !filtering && <p className="text-mute">No orders yet.</p>}
      {!total && filtering && (
        <p data-testid="no-matches" className="text-mute">
          No orders match that search.
        </p>
      )}
      {total > 0 && (
        <p className="mb-2 text-xs text-mute">
          {total} order{total === 1 ? '' : 's'}
          {pages > 1 ? ` · page ${page} of ${pages}` : ''}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-ink">
              <th className="p-2">Date</th>
              <th className="p-2">Order</th>
              <th className="p-2">Item</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Status</th>
              <th className="p-2">Paid</th>
              <th className="p-2">Profit</th>
              <th className="p-2">Files</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ order, product, color, size, note }) => (
              <tr key={order.id} className="border-b border-ink/20 align-top">
                <td className="whitespace-nowrap p-2 text-xs">{when(order.createdAt)}</td>
                <td className="p-2">
                  <Link className="font-mono underline" href={`/admin/orders/${order.id}`}>
                    {order.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="p-2">
                  <div className="flex items-start gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={(order.mockupPath && thumb.get(order.mockupPath)) || `/api/admin/designs/${order.designId}/preview`} alt="" loading="lazy" className="h-12 w-10 flex-none rounded border border-ink/30 bg-paper-2 object-cover" />
                    <span>
                      {product ? `${catalog[product].label} · ${color ? colorLabel(color) : ''} · ${size}` : '—'}
                      {order.quantity > 1 ? ` × ${order.quantity}` : ''}
                      {note && (
                        <span className="block max-w-48 truncate text-xs text-mute" title={note}>
                          Note: {note}
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="p-2">
                  {order.delivery.name}
                  <br />
                  <span className="text-mute">
                    {order.delivery.phone} · {order.delivery.city}
                  </span>
                </td>
                <td className="p-2">
                  {ORDER_STATUS_LABEL[order.status]}
                  {order.refundedKes ? <span className="block text-xs text-vermilion">Refunded {kes(order.refundedKes)}</span> : null}
                </td>
                <td className="whitespace-nowrap p-2">{kes(order.priceKes + order.deliveryFeeKes)}</td>
                <td className="whitespace-nowrap p-2">{kes(orderProfit(order))}</td>
                <td className="p-2">{order.artifactsFailed || !order.designFilePath ? <span className="font-semibold text-vermilion">Missing</span> : 'Ready'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3">
          {page > 1 && (
            <Link className="btn btn-quiet btn-sm" href={`/admin/orders?${query({ page: String(page - 1) })}`}>
              &larr; Newer
            </Link>
          )}
          {page < pages && (
            <Link className="btn btn-quiet btn-sm" href={`/admin/orders?${query({ page: String(page + 1) })}`}>
              Older &rarr;
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
