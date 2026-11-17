import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { BACK_PRINT_COST_KES, BACK_PRINT_PRICE_KES, catalog, colorHex, colorLabel, COLORS, fallbackColor, isLightColor, offersColor, printAreaFor, SIZES } from '@/lib/catalog';

describe('catalog', () => {
  test('has exactly tee and hoodie', () => {
    expect(Object.keys(catalog).sort()).toEqual(['hoodie', 'tee']);
  });

  test('there are ten garment colours, each with a label and a swatch', () => {
    expect(COLORS).toEqual(['black', 'white', 'grey', 'navy', 'blue', 'green', 'maroon', 'red', 'orange', 'yellow']);
    for (const c of COLORS) {
      expect(colorLabel(c).length).toBeGreaterThan(2);
      expect(colorHex(c)).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(colorLabel('navy')).toBe('Navy blue');
    expect(colorLabel('maroon')).toBe('Burgundy');
    expect(colorLabel('grey')).toBe('Heather grey');
  });

  test('T-shirts come in every colour; hoodies in every colour but orange (there is no orange hoodie photo)', () => {
    expect(catalog.tee.colors).toEqual(COLORS);
    expect(catalog.hoodie.colors).toEqual(COLORS.filter((c) => c !== 'orange'));
    expect(offersColor('hoodie', 'orange')).toBe(false);
    expect(offersColor('hoodie', 'maroon')).toBe(true);
  });

  test('every colour an item is sold in has its front and back picture on disk', () => {
    for (const p of Object.values(catalog)) {
      for (const c of p.colors) {
        for (const side of ['front', 'back'] as const) {
          const file = path.join('public', p.garmentImage(c, side));
          expect(existsSync(file), file).toBe(true);
        }
      }
    }
    expect(catalog.tee.garmentImage('maroon')).toBe('/garments/tee-maroon.jpg');
    expect(catalog.hoodie.garmentImage('maroon', 'back')).toBe('/garments/hoodie-back-maroon.jpg');
  });

  test('light and dark colours are told apart (dark ink on light shirts, white ink on dark ones)', () => {
    expect(COLORS.filter(isLightColor)).toEqual(['white', 'grey', 'orange', 'yellow']);
  });

  test('switching to an item that does not come in the colour picks the nearest of light or dark', () => {
    expect(fallbackColor('hoodie', 'orange')).toBe('white'); // orange counts as a light colour
    expect(fallbackColor('hoodie', 'navy')).toBe('navy');
    expect(fallbackColor('hoodie', 'black')).toBe('black');
    expect(fallbackColor('tee', 'maroon')).toBe('maroon');
  });

  test('sizes are S,M,L,XL in order', () => {
    expect(SIZES).toEqual(['S', 'M', 'L', 'XL']);
  });

  test('cost is 800 for tee and 1300 for hoodie', () => {
    expect(catalog.tee.costKes).toBe(800);
    expect(catalog.hoodie.costKes).toBe(1300);
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
      for (const color of p.colors) {
        expect(p.garmentImage(color, 'back')).toContain('back');
        expect(p.garmentImage(color, 'back')).not.toBe(p.garmentImage(color));
        expect(p.garmentImage(color)).toBe(p.garmentImage(color, 'front'));
      }
    }
  });

  test('printing on the back adds a price that is more than what it costs', () => {
    expect(BACK_PRINT_PRICE_KES).toBeGreaterThan(BACK_PRINT_COST_KES);
    expect(BACK_PRINT_COST_KES).toBeGreaterThan(0);
  });
});
