import type { OrderStatus } from '@/lib/orders';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  paid: 'Paid',
  at_printer: 'At printer',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;

/** "Order 5+ of one design and save 5%, 10+ save 10%": what a customer is told about bulk prices. Empty when there are none. */
export const bulkTiersLabel = (tiers: { minQuantity: number; percentOff: number }[]) =>
  tiers.length === 0 ? '' : `Order more of one design and pay less each: ${tiers.map((t) => `${t.minQuantity}+ save ${t.percentOff}%`).join(', ')}.`;

/** Which sides of a design are printed, in words: "front", "back" or "front and back". */
export function printedSides(d: { layers: readonly unknown[]; backLayers: readonly unknown[] }): 'front' | 'back' | 'front and back' {
  if (d.layers.length > 0 && d.backLayers.length > 0) return 'front and back';
  return d.backLayers.length > 0 ? 'back' : 'front';
}
