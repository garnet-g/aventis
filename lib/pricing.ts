import type { ProductId } from '@/lib/catalog';
import { isNairobiArea } from '@/lib/counties';
import { DEFAULT_PRICES, type Prices } from '@/lib/prices';

import { MAX_QUANTITY } from '@/lib/limits';

export { MAX_QUANTITY };

type Priced = { product: ProductId; backLayers: readonly unknown[] };

const hasBack = (d: Priced) => d.backLayers.length > 0;

/** The percentage taken off each piece when the cart holds this many pieces in all (0 when no bulk price applies). */
export const bulkPercentOff = (quantity: number, p: Prices = DEFAULT_PRICES) =>
  p.bulkTiers.reduce((best, t) => (quantity >= t.minQuantity ? Math.max(best, t.percentOff) : best), 0);

/** One piece at the normal price: the garment, plus the back print when the back has anything on it. */
export const listUnitPriceKes = (d: Priced, p: Prices = DEFAULT_PRICES) => p[d.product].priceKes + (hasBack(d) ? p.backPriceKes : 0);

/** What the customer pays for one piece when the cart holds `pieces` pieces in all: the normal price less any bulk discount. */
export const unitPriceKes = (d: Priced, p: Prices = DEFAULT_PRICES, pieces = 1) =>
  Math.round((listUnitPriceKes(d, p) * (100 - bulkPercentOff(pieces, p))) / 100);

/** What one piece costs us to have printed. */
export const unitCostKes = (d: Priced, p: Prices = DEFAULT_PRICES) => p[d.product].costKes + (hasBack(d) ? p.backCostKes : 0);

/** `cartPieces` is every piece in the cart (it decides the bulk price); it defaults to this line alone. */
export const lineTotals = (d: Priced, quantity: number, p: Prices = DEFAULT_PRICES, cartPieces = quantity) => ({
  priceKes: unitPriceKes(d, p, cartPieces) * quantity,
  costKes: unitCostKes(d, p) * quantity,
});

/** The delivery fee for a county: the Nairobi-area rate, or the upcountry rate (Nairobi rate when not chosen yet). */
export const deliveryFeeFor = (p: Prices = DEFAULT_PRICES, county?: string) => (isNairobiArea(county) ? p.deliveryFeeKes : p.deliveryFeeUpcountryKes);

/** Delivery is charged once per checkout, however many designs or pieces it holds. */
export function checkoutTotals(lines: { priceKes: number }[], p: Prices = DEFAULT_PRICES, county?: string) {
  const subtotalKes = lines.reduce((sum, l) => sum + l.priceKes, 0);
  const deliveryFeeKes = lines.length > 0 ? deliveryFeeFor(p, county) : 0;
  return { subtotalKes, deliveryFeeKes, totalKes: subtotalKes + deliveryFeeKes };
}
