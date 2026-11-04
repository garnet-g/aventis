import { z } from 'zod';
import { BACK_PRINT_COST_KES, BACK_PRINT_PRICE_KES, catalog, DELIVERY_FEE_KES } from '@/lib/catalog';
import { HttpError } from '@/lib/errors';
import { MAX_QUANTITY } from '@/lib/limits';

/** "Order this many of one design and pay this much less for each piece." */
export type BulkTier = { minQuantity: number; percentOff: number };

/** Everything the owner can change on screen. What a customer pays and what we pay the printer. */
export type Prices = {
  tee: { priceKes: number; costKes: number };
  hoodie: { priceKes: number; costKes: number };
  backPriceKes: number;
  backCostKes: number;
  deliveryFeeKes: number;
  /** Cheaper per piece for bigger orders of one design, smallest tier first. Empty means no bulk pricing. */
  bulkTiers: BulkTier[];
};

export const DEFAULT_BULK_TIERS: BulkTier[] = [
  { minQuantity: 5, percentOff: 5 },
  { minQuantity: 10, percentOff: 10 },
  { minQuantity: 25, percentOff: 15 },
];

/** Used until the owner saves their own (and as the fallback if the database cannot be read). */
export const DEFAULT_PRICES: Prices = {
  tee: { priceKes: catalog.tee.priceKes, costKes: catalog.tee.costKes },
  hoodie: { priceKes: catalog.hoodie.priceKes, costKes: catalog.hoodie.costKes },
  backPriceKes: BACK_PRINT_PRICE_KES,
  backCostKes: BACK_PRINT_COST_KES,
  deliveryFeeKes: DELIVERY_FEE_KES,
  bulkTiers: DEFAULT_BULK_TIERS,
};

const amount = z.number({ message: 'Enter a number.' }).int('Use whole shillings.').min(0, 'Cannot be negative.').max(1_000_000, 'That is too large.');
const pair = z.object({ priceKes: amount, costKes: amount });
const tier = z.object({
  minQuantity: z.number({ message: 'Enter a number.' }).int('Use whole pieces.').min(2, 'A bulk price starts at 2 pieces or more.').max(MAX_QUANTITY, `A bulk price cannot start above ${MAX_QUANTITY} pieces.`),
  percentOff: z.number({ message: 'Enter a number.' }).int('Use a whole percentage.').min(1, 'A discount must be at least 1%.').max(90, 'A discount cannot be more than 90%.'),
});
// Smallest tier first. Each bigger order must start at a different quantity and must not save less than a smaller one.
const tiers = z
  .array(tier)
  .max(5, 'Use at most 5 bulk prices.')
  .transform((list) => [...list].sort((a, b) => a.minQuantity - b.minQuantity))
  .refine((list) => list.every((t, i) => i === 0 || t.minQuantity > list[i - 1].minQuantity), 'Each bulk price needs its own starting quantity.')
  .refine((list) => list.every((t, i) => i === 0 || t.percentOff >= list[i - 1].percentOff), 'A bigger order must not save less than a smaller one.');
// An older saved set of prices has no bulk prices yet; it gets the defaults.
const pricesSchema = z.object({ tee: pair, hoodie: pair, backPriceKes: amount, backCostKes: amount, deliveryFeeKes: amount, bulkTiers: tiers.default(DEFAULT_BULK_TIERS) });

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
