import type { ProductId } from '@/lib/catalog';
import { DEFAULT_PRICES, type Prices } from '@/lib/prices';

import { MAX_QUANTITY } from '@/lib/limits';

export { MAX_QUANTITY };

type Priced = { product: ProductId; backLayers: readonly unknown[] };

const hasBack = (d: Priced) => d.backLayers.length > 0;

/** The percentage taken off each piece for ordering this many of one design (0 when no bulk price applies). */
export const bulkPercentOff = (quantity: number, p: Prices = DEFAULT_PRICES) =>
  p.bulkTiers.reduce((best, t) => (quantity >= t.minQuantity ? Math.max(best, t.percentOff) : best), 0);

/** One piece at the normal price: the garment, plus the back print when the back has anything on it. */
export const listUnitPriceKes = (d: Priced, p: Prices = DEFAULT_PRICES) => p[d.product].priceKes + (hasBack(d) ? p.backPriceKes : 0);

/** What the customer pays for one piece when ordering `quantity` of this design: the normal price less any bulk discount. */
export const unitPriceKes = (d: Priced, p: Prices = DEFAULT_PRICES, quantity = 1) =>
  Math.round((listUnitPriceKes(d, p) * (100 - bulkPercentOff(quantity, p))) / 100);

/** What one piece costs us to have printed. */
export const unitCostKes = (d: Priced, p: Prices = DEFAULT_PRICES) => p[d.product].costKes + (hasBack(d) ? p.backCostKes : 0);

export const lineTotals = (d: Priced, quantity: number, p: Prices = DEFAULT_PRICES) => ({
  priceKes: unitPriceKes(d, p, quantity) * quantity,
  costKes: unitCostKes(d, p) * quantity,
});

/** Delivery is charged once per checkout, however many designs or pieces it holds. */
export function checkoutTotals(lines: { priceKes: number }[], p: Prices = DEFAULT_PRICES) {
  const subtotalKes = lines.reduce((sum, l) => sum + l.priceKes, 0);
  const deliveryFeeKes = lines.length > 0 ? p.deliveryFeeKes : 0;
  return { subtotalKes, deliveryFeeKes, totalKes: subtotalKes + deliveryFeeKes };
}
