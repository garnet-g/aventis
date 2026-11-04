import { describe, expect, test } from 'vitest';
import { BACK_PRINT_COST_PKR, BACK_PRINT_PRICE_PKR, catalog, DELIVERY_FEE_PKR } from '@/lib/catalog';
import { checkoutTotals, lineTotals, MAX_QUANTITY, unitCostPkr, unitPricePkr } from '@/lib/pricing';

const tee = { product: 'tee' as const, backLayers: [] };
const teeBack = { product: 'tee' as const, backLayers: [{}] };
const hoodie = { product: 'hoodie' as const, backLayers: [] };

describe('unit price and cost', () => {
  test('a front-only item costs the catalog price', () => {
    expect(unitPricePkr(tee)).toBe(catalog.tee.pricePkr);
    expect(unitCostPkr(tee)).toBe(catalog.tee.costPkr);
    expect(unitPricePkr(hoodie)).toBe(catalog.hoodie.pricePkr);
  });

  test('printing the back adds the back price and the back cost', () => {
    expect(unitPricePkr(teeBack)).toBe(catalog.tee.pricePkr + BACK_PRINT_PRICE_PKR);
    expect(unitCostPkr(teeBack)).toBe(catalog.tee.costPkr + BACK_PRINT_COST_PKR);
  });
});

describe('lineTotals', () => {
  test('multiplies price and cost by the quantity', () => {
    expect(lineTotals(tee, 3)).toEqual({ pricePkr: 3 * catalog.tee.pricePkr, costPkr: 3 * catalog.tee.costPkr });
  });

  test('the back extra is charged for every unit', () => {
    expect(lineTotals(teeBack, 2)).toEqual({
      pricePkr: 2 * (catalog.tee.pricePkr + BACK_PRINT_PRICE_PKR),
      costPkr: 2 * (catalog.tee.costPkr + BACK_PRINT_COST_PKR),
    });
  });
});

describe('checkoutTotals', () => {
  test('delivery is charged once, however many items there are', () => {
    const t = checkoutTotals([{ pricePkr: 1500 }, { pricePkr: 2200 }, { pricePkr: 4500 }]);
    expect(t).toEqual({ subtotalPkr: 8200, deliveryFeePkr: DELIVERY_FEE_PKR, totalPkr: 8200 + DELIVERY_FEE_PKR });
  });

  test('an empty cart has no delivery fee and no total', () => {
    expect(checkoutTotals([])).toEqual({ subtotalPkr: 0, deliveryFeePkr: 0, totalPkr: 0 });
  });
});

test('a single line can be ordered up to 50 times', () => {
  expect(MAX_QUANTITY).toBe(50);
});
