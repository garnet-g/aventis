import type { ProductId } from '@/lib/catalog';
import { DEFAULT_PRICES, type Prices } from '@/lib/prices';

/** The most of one design that can be ordered at once. */
export const MAX_QUANTITY = 50;

type Priced = { product: ProductId; backLayers: readonly unknown[] };

const hasBack = (d: Priced) => d.backLayers.length > 0;

/** What the customer pays for one piece: the garment, plus the back print when the back has anything on it. */
export const unitPricePkr = (d: Priced, p: Prices = DEFAULT_PRICES) => p[d.product].pricePkr + (hasBack(d) ? p.backPricePkr : 0);

/** What one piece costs us to have printed. */
export const unitCostPkr = (d: Priced, p: Prices = DEFAULT_PRICES) => p[d.product].costPkr + (hasBack(d) ? p.backCostPkr : 0);

export const lineTotals = (d: Priced, quantity: number, p: Prices = DEFAULT_PRICES) => ({
  pricePkr: unitPricePkr(d, p) * quantity,
  costPkr: unitCostPkr(d, p) * quantity,
});

/** Delivery is charged once per checkout, however many designs or pieces it holds. */
export function checkoutTotals(lines: { pricePkr: number }[], p: Prices = DEFAULT_PRICES) {
  const subtotalPkr = lines.reduce((sum, l) => sum + l.pricePkr, 0);
  const deliveryFeePkr = lines.length > 0 ? p.deliveryFeePkr : 0;
  return { subtotalPkr, deliveryFeePkr, totalPkr: subtotalPkr + deliveryFeePkr };
}
