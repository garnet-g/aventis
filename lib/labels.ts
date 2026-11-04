import type { OrderStatus } from '@/lib/orders';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  paid: 'Paid',
  at_printer: 'At printer',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

export const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;

/** "Order 5+ of one design and save 5%, 10+ save 10%": what a customer is told about bulk prices. Empty when there are none. */
export const bulkTiersLabel = (tiers: { minQuantity: number; percentOff: number }[]) =>
  tiers.length === 0 ? '' : `Order more of one design and pay less each: ${tiers.map((t) => `${t.minQuantity}+ save ${t.percentOff}%`).join(', ')}.`;
