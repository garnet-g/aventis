import { describe, expect, test } from 'vitest';
import { BACK_PRINT_COST_KES, BACK_PRINT_PRICE_KES, catalog, DELIVERY_FEE_KES } from '@/lib/catalog';
import { checkoutTotals, lineTotals, MAX_QUANTITY, unitCostKes, unitPriceKes } from '@/lib/pricing';

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
