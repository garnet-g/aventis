import { NextResponse } from 'next/server';
import { orderProfit } from '@/lib/admin';
import { csvCell, queryAdminOrders } from '@/lib/adminOrders';
import { requireAdmin } from '@/lib/auth';
import { catalog, colorLabel } from '@/lib/catalog';
import { errorResponse } from '@/lib/http';
import { ORDER_STATUS_LABEL } from '@/lib/labels';

/** The orders matching the list's filters as a CSV file (for the printer, the courier or the accounts). */
export async function GET(req: Request) {
  await requireAdmin();
  try {
    const p = new URL(req.url).searchParams;
    const filters = { q: p.get('q') ?? '', status: p.get('status') ?? '', from: p.get('from') ?? '', to: p.get('to') ?? '' };
    const all = [];
    for (let offset = 0; offset < 20_000; offset += 1000) {
      const { rows } = await queryAdminOrders(filters, { offset, limit: 1000 });
      all.push(...rows);
      if (rows.length < 1000) break;
    }
    const header = ['Order', 'Date (Nairobi)', 'Status', 'Item', 'Colour', 'Size', 'Quantity', 'Paid KES', 'Print cost KES', 'Profit KES', 'Customer', 'Phone', 'Town', 'County', 'Address', 'Payment ref', 'Courier', 'Tracking', 'Refunded KES', 'Note'];
    const lines = all.map(({ order: o, product, color, size, note }) =>
      [
        o.id.slice(0, 8).toUpperCase(),
        o.createdAt ? new Date(o.createdAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : '',
        ORDER_STATUS_LABEL[o.status],
        product ? catalog[product].label : '',
        color ? colorLabel(color) : '',
        size ?? '',
        o.quantity,
        o.priceKes + o.deliveryFeeKes,
        o.costKes,
        orderProfit(o),
        o.delivery.name,
        o.delivery.phone,
        o.delivery.city,
        o.delivery.county,
        o.delivery.address,
        o.paymentRef,
        o.courier ?? '',
        o.tracking ?? '',
        o.refundedKes ?? '',
        note,
      ]
        .map(csvCell)
        .join(','),
    );
    const csv = `\uFEFF${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="vibecrew-orders-${day}.csv"`, 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
