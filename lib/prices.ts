import { z } from 'zod';
import { BACK_PRINT_COST_PKR, BACK_PRINT_PRICE_PKR, catalog, DELIVERY_FEE_PKR } from '@/lib/catalog';
import { HttpError } from '@/lib/errors';

/** Everything the owner can change on screen. What a customer pays and what we pay the printer. */
export type Prices = {
  tee: { pricePkr: number; costPkr: number };
  hoodie: { pricePkr: number; costPkr: number };
  backPricePkr: number;
  backCostPkr: number;
  deliveryFeePkr: number;
};

/** Used until the owner saves their own (and as the fallback if the database cannot be read). */
export const DEFAULT_PRICES: Prices = {
  tee: { pricePkr: catalog.tee.pricePkr, costPkr: catalog.tee.costPkr },
  hoodie: { pricePkr: catalog.hoodie.pricePkr, costPkr: catalog.hoodie.costPkr },
  backPricePkr: BACK_PRINT_PRICE_PKR,
  backCostPkr: BACK_PRINT_COST_PKR,
  deliveryFeePkr: DELIVERY_FEE_PKR,
};

const amount = z.number({ message: 'Enter a number.' }).int('Use whole rupees.').min(0, 'Cannot be negative.').max(1_000_000, 'That is too large.');
const pair = z.object({ pricePkr: amount, costPkr: amount });
const pricesSchema = z.object({ tee: pair, hoodie: pair, backPricePkr: amount, backCostPkr: amount, deliveryFeePkr: amount });

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
