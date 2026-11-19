import { ORDER_STATUSES } from '@/lib/admin';
import type { Color, ProductId, Size } from '@/lib/catalog';
import type { Order } from '@/lib/orders';
import { toOrder, type OrderRow } from '@/lib/ordersStore';
import { getServiceClient } from '@/lib/supabase/server';

export type OrderFilters = { q?: string; status?: string; from?: string; to?: string };
export type AdminOrderRow = { order: Order; product: ProductId | null; color: Color | null; size: Size | null; note: string };

export const PAGE_SIZE = 50;

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date in YYYY-MM-DD (2026-13-45 has the right shape but is not a day). */
export function isDate(d: string): boolean {
  if (!DATE_SHAPE.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(d);
}

/** Kenyan mobiles are stored as 07XX / 01XX; a search typed as +254 7XX or 254 7XX means the same number. */
export function searchWord(w: string): string {
  const m = w.match(/^\+?254([17]\d{8})$/);
  return m ? `0${m[1]}` : w;
}
/** Dates are entered in Nairobi time; the database keeps UTC. */
const nairobiStart = (d: string) => `${d}T00:00:00+03:00`;
const nextDay = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

/**
 * The admin order list, newest first, filtered in the database so it stays fast however many orders there are.
 * Every word of the search must match something: the customer's name, phone, town or county, the tracking number,
 * the payment reference, the first 8 characters of the order number, or the private note.
 */
export async function queryAdminOrders(filters: OrderFilters, page: { offset: number; limit: number }) {
  const db = getServiceClient();
  let q = db.from('orders').select('*, designs(product, color, size)', { count: 'exact' }).order('created_at', { ascending: false });

  const status = ORDER_STATUSES.find((s) => s === filters.status);
  if (status) q = q.eq('status', status);
  if (filters.from && isDate(filters.from)) q = q.gte('created_at', nairobiStart(filters.from));
  if (filters.to && isDate(filters.to)) q = q.lt('created_at', nairobiStart(nextDay(filters.to)));

  const words = (filters.q ?? '').toLowerCase().split(/\s+/).map((w) => searchWord(w.replace(/[^\p{L}\p{N}+@.\-]/gu, ''))).filter(Boolean).slice(0, 5);
  for (const w of words) {
    const like = `%${w}%`;
    const { data: noted } = await db.from('order_notes').select('order_id').ilike('note', like).limit(200);
    const parts = [`name.ilike.${like}`, `phone.ilike.${like}`, `city.ilike.${like}`, `county.ilike.${like}`, `tracking.ilike.${like}`, `payment_ref.ilike.${like}`];
    if (/^[0-9a-f]{8}$/.test(w)) parts.push(`and(id.gte.${w}-0000-0000-0000-000000000000,id.lte.${w}-ffff-ffff-ffff-ffffffffffff)`);
    if (noted?.length) parts.push(`id.in.(${noted.map((n) => n.order_id).join(',')})`);
    q = q.or(parts.join(','));
  }

  const { data, count, error } = await q.range(page.offset, page.offset + page.limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (OrderRow & { designs: { product: ProductId; color: Color; size: Size } | null })[];
  const ids = rows.map((r) => r.id);
  const { data: notes } = ids.length ? await db.from('order_notes').select('order_id, note').in('order_id', ids) : { data: [] };
  const noteFor = new Map((notes ?? []).map((n) => [n.order_id as string, n.note as string]));
  const list: AdminOrderRow[] = rows.map((r) => ({
    order: toOrder(r),
    product: r.designs?.product ?? null,
    color: r.designs?.color ?? null,
    size: r.designs?.size ?? null,
    note: noteFor.get(r.id) ?? '',
  }));
  return { rows: list, total: count ?? list.length };
}

/** One CSV cell: quoted, with quotes doubled; a leading = + - @ is defused so spreadsheets don't run it as a formula. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
