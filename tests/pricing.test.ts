import { describe, expect, test } from 'vitest';
import { BACK_PRINT_COST_KES, BACK_PRINT_PRICE_KES, catalog, DELIVERY_FEE_KES } from '@/lib/catalog';
import { checkoutTotals, bulkPercentOff, lineTotals, listUnitPriceKes, MAX_QUANTITY, unitCostKes, unitPriceKes } from '@/lib/pricing';
import { DEFAULT_BULK_TIERS, DEFAULT_PRICES, parsePrices, pricesFromStored } from '@/lib/prices';

const tee = { product: 'tee' as const, backLayers: [] };
const teeBack = { product: 'tee' as const, backLayers: [{}] };
const hoodie = { product: 'hoodie' as const, backLayers: [] };

describe('unit price and cost', () => {
  test('a front-only item costs the catalog price', () => {
    expect(unitPriceKes(tee)).toBe(catalog.tee.priceKes);
    expect(unitCostKes(tee)).toBe(catalog.tee.costKes);
    expect(unitPriceKes(hoodie)).toBe(catalog.hoodie.priceKes);
  });

  test('printing the back adds the back price and the back cost', () => {
    expect(unitPriceKes(teeBack)).toBe(catalog.tee.priceKes + BACK_PRINT_PRICE_KES);
    expect(unitCostKes(teeBack)).toBe(catalog.tee.costKes + BACK_PRINT_COST_KES);
  });
});

describe('lineTotals', () => {
  test('multiplies price and cost by the quantity', () => {
    expect(lineTotals(tee, 3)).toEqual({ priceKes: 3 * catalog.tee.priceKes, costKes: 3 * catalog.tee.costKes });
  });

  test('the back extra is charged for every unit', () => {
    expect(lineTotals(teeBack, 2)).toEqual({
      priceKes: 2 * (catalog.tee.priceKes + BACK_PRINT_PRICE_KES),
      costKes: 2 * (catalog.tee.costKes + BACK_PRINT_COST_KES),
    });
  });
});

describe('checkoutTotals', () => {
  test('delivery is charged once, however many items there are', () => {
    const t = checkoutTotals([{ priceKes: 1500 }, { priceKes: 2200 }, { priceKes: 4500 }]);
    expect(t).toEqual({ subtotalKes: 8200, deliveryFeeKes: DELIVERY_FEE_KES, totalKes: 8200 + DELIVERY_FEE_KES });
  });

  test('an empty cart has no delivery fee and no total', () => {
    expect(checkoutTotals([])).toEqual({ subtotalKes: 0, deliveryFeeKes: 0, totalKes: 0 });
  });
});

test('a single line can be ordered up to 50 times', () => {
  expect(MAX_QUANTITY).toBe(50);
});

describe('bulk prices', () => {
  const prices = { ...DEFAULT_PRICES, bulkTiers: [{ minQuantity: 5, percentOff: 5 }, { minQuantity: 10, percentOff: 10 }, { minQuantity: 25, percentOff: 15 }] };

  test('the biggest tier the quantity reaches applies', () => {
    expect([1, 4, 5, 9, 10, 24, 25, 50].map((q) => bulkPercentOff(q, prices))).toEqual([0, 0, 5, 5, 10, 10, 15, 15]);
  });

  test('each piece costs less, the total is the discounted piece times the quantity, and the printer cost is unchanged', () => {
    const list = catalog.tee.priceKes;
    expect(unitPriceKes(tee, prices, 1)).toBe(list);
    expect(unitPriceKes(tee, prices, 10)).toBe(Math.round(list * 0.9));
    expect(lineTotals(tee, 10, prices)).toEqual({ priceKes: Math.round(list * 0.9) * 10, costKes: 10 * catalog.tee.costKes });
  });

  test('the back print is discounted along with the garment', () => {
    const list = catalog.tee.priceKes + BACK_PRINT_PRICE_KES;
    expect(listUnitPriceKes(teeBack, prices)).toBe(list);
    expect(unitPriceKes(teeBack, prices, 25)).toBe(Math.round(list * 0.85));
  });

  test('no tiers means no discount', () => {
    expect(unitPriceKes(tee, { ...DEFAULT_PRICES, bulkTiers: [] }, 50)).toBe(catalog.tee.priceKes);
  });
});

describe('saving bulk prices', () => {
  const base = { tee: { priceKes: 1500, costKes: 800 }, hoodie: { priceKes: 2200, costKes: 1300 }, backPriceKes: 500, backCostKes: 400, deliveryFeeKes: 250 };

  test('tiers are sorted, and prices saved before bulk prices existed get the defaults', () => {
    expect(parsePrices({ ...base, bulkTiers: [{ minQuantity: 20, percentOff: 20 }, { minQuantity: 6, percentOff: 8 }] }).bulkTiers).toEqual([
      { minQuantity: 6, percentOff: 8 },
      { minQuantity: 20, percentOff: 20 },
    ]);
    expect(pricesFromStored(base).bulkTiers).toEqual(DEFAULT_BULK_TIERS);
    expect(parsePrices({ ...base, bulkTiers: [] }).bulkTiers).toEqual([]);
  });

  test.each([
    ['a start below 2', [{ minQuantity: 1, percentOff: 5 }]],
    ['a start above the most that can be ordered', [{ minQuantity: 51, percentOff: 5 }]],
    ['a discount of 0%', [{ minQuantity: 5, percentOff: 0 }]],
    ['a discount over 90%', [{ minQuantity: 5, percentOff: 95 }]],
    ['a fraction', [{ minQuantity: 5.5, percentOff: 5 }]],
    ['two tiers starting at the same quantity', [{ minQuantity: 5, percentOff: 5 }, { minQuantity: 5, percentOff: 8 }]],
    ['a bigger order saving less', [{ minQuantity: 5, percentOff: 10 }, { minQuantity: 10, percentOff: 5 }]],
    ['more than 5 tiers', [2, 3, 4, 5, 6, 7].map((q) => ({ minQuantity: q, percentOff: q }))],
  ])('refuses %s', (_name, bulkTiers) => {
    expect(() => parsePrices({ ...base, bulkTiers })).toThrow();
  });
});
