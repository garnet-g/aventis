import { BACK_PRINT_COST_PKR, BACK_PRINT_PRICE_PKR, catalog, DELIVERY_FEE_PKR, type ProductId } from '@/lib/catalog';

/** The most of one design that can be ordered at once. */
export const MAX_QUANTITY = 50;

type Priced = { product: ProductId; backLayers: readonly unknown[] };

const hasBack = (d: Priced) => d.backLayers.length > 0;

/** What the customer pays for one piece: the garment, plus the back print when the back has anything on it. */
export const unitPricePkr = (d: Priced) => catalog[d.product].pricePkr + (hasBack(d) ? BACK_PRINT_PRICE_PKR : 0);

/** What one piece costs us to have printed. */
export const unitCostPkr = (d: Priced) => catalog[d.product].costPkr + (hasBack(d) ? BACK_PRINT_COST_PKR : 0);

export const lineTotals = (d: Priced, quantity: number) => ({
  pricePkr: unitPricePkr(d) * quantity,
  costPkr: unitCostPkr(d) * quantity,
});

/** Delivery is charged once per checkout, however many designs or pieces it holds. */
export function checkoutTotals(lines: { pricePkr: number }[]) {
  const subtotalPkr = lines.reduce((sum, l) => sum + l.pricePkr, 0);
  const deliveryFeePkr = lines.length > 0 ? DELIVERY_FEE_PKR : 0;
  return { subtotalPkr, deliveryFeePkr, totalPkr: subtotalPkr + deliveryFeePkr };
}
