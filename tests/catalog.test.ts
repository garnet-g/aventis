import { describe, expect, test } from 'vitest';
import { BACK_PRINT_COST_PKR, BACK_PRINT_PRICE_PKR, catalog, COLORS, printAreaFor, SIZES } from '@/lib/catalog';

describe('catalog', () => {
  test('has exactly tee and hoodie', () => {
    expect(Object.keys(catalog).sort()).toEqual(['hoodie', 'tee']);
  });

  test('colors are white and black', () => {
    expect(COLORS).toEqual(['white', 'black']);
  });

  test('sizes are S,M,L,XL in order', () => {
    expect(SIZES).toEqual(['S', 'M', 'L', 'XL']);
  });

  test('cost is 800 for tee and 1300 for hoodie', () => {
    expect(catalog.tee.costPkr).toBe(800);
    expect(catalog.hoodie.costPkr).toBe(1300);
  });

  test('every product has positive print area dimensions', () => {
    for (const p of Object.values(catalog)) {
      expect(p.printArea.widthCm).toBeGreaterThan(0);
      expect(p.printArea.heightCm).toBeGreaterThan(0);
    }
  });

  test('every product can be printed on the back: its own print area and its own garment photo', () => {
    for (const [id, p] of Object.entries(catalog)) {
      const back = printAreaFor(id as keyof typeof catalog, 'back');
      expect(back.widthCm).toBeGreaterThan(0);
      expect(back.heightCm).toBeGreaterThan(0);
      expect(printAreaFor(id as keyof typeof catalog, 'front')).toEqual(p.printArea);
      for (const color of COLORS) {
        expect(p.garmentImage(color, 'back')).toContain('back');
        expect(p.garmentImage(color, 'back')).not.toBe(p.garmentImage(color));
        expect(p.garmentImage(color)).toBe(p.garmentImage(color, 'front'));
      }
    }
  });

  test('printing on the back adds a price that is more than what it costs', () => {
    expect(BACK_PRINT_PRICE_PKR).toBeGreaterThan(BACK_PRINT_COST_PKR);
    expect(BACK_PRINT_COST_PKR).toBeGreaterThan(0);
  });
});
