import { z } from 'zod';
import { BACK_PRINT_COST_KES, BACK_PRINT_PRICE_KES, catalog, DELIVERY_FEE_KES } from '@/lib/catalog';
import { HttpError } from '@/lib/errors';

/** Everything the owner can change on screen. What a customer pays and what we pay the printer. */
export type Prices = {
  tee: { priceKes: number; costKes: number };
  hoodie: { priceKes: number; costKes: number };
  backPriceKes: number;
  backCostKes: number;
  deliveryFeeKes: number;
};

/** Used until the owner saves their own (and as the fallback if the database cannot be read). */
export const DEFAULT_PRICES: Prices = {
  tee: { priceKes: catalog.tee.priceKes, costKes: catalog.tee.costKes },
  hoodie: { priceKes: catalog.hoodie.priceKes, costKes: catalog.hoodie.costKes },
  backPriceKes: BACK_PRINT_PRICE_KES,
  backCostKes: BACK_PRINT_COST_KES,
  deliveryFeeKes: DELIVERY_FEE_KES,
};

const amount = z.number({ message: 'Enter a number.' }).int('Use whole shillings.').min(0, 'Cannot be negative.').max(1_000_000, 'That is too large.');
const pair = z.object({ priceKes: amount, costKes: amount });
const pricesSchema = z.object({ tee: pair, hoodie: pair, backPriceKes: amount, backCostKes: amount, deliveryFeeKes: amount });

export function parsePrices(input: unknown): Prices {
  const r = pricesSchema.safeParse(input);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? 'Check the prices.');
  return r.data;
}

/** Reads the saved prices, filling anything missing or broken from the defaults. */
export function pricesFromStored(stored: unknown): Prices {
  const r = pricesSchema.safeParse(stored);
  return r.success ? r.data : DEFAULT_PRICES;
}

export interface PriceStore {
  get(): Promise<Prices>;
  set(prices: Prices): Promise<void>;
}

export async function savePrices(store: PriceStore, input: unknown): Promise<Prices> {
  const prices = parsePrices(input);
  await store.set(prices);
  return prices;
}
