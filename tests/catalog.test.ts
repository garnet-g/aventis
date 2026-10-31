import { describe, expect, test } from 'vitest';
import { catalog, COLORS, SIZES } from '@/lib/catalog';

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
});
