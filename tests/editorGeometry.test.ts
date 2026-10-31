import { describe, expect, test } from 'vitest';
import {
  CANVAS_H,
  CANVAS_W,
  detectDirection,
  fromFraction,
  printAreaRect,
  toFraction,
} from '@/lib/editorGeometry';

describe('printAreaRect', () => {
  test('is centered horizontally and fully inside the canvas for every product', () => {
    for (const p of ['tee', 'hoodie'] as const) {
      const r = printAreaRect(p);
      expect(r.x + r.width / 2).toBeCloseTo(CANVAS_W / 2);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(CANVAS_W);
      expect(r.y + r.height).toBeLessThanOrEqual(CANVAS_H);
    }
  });

  test('tee area has the aspect ratio of its print area in cm (28 x 32)', () => {
    const r = printAreaRect('tee');
    expect(r.width / r.height).toBeCloseTo(28 / 32);
  });
});

describe('fractions', () => {
  const area = { x: 100, y: 50, width: 200, height: 400 };

  test('toFraction maps a rect inside the area to 0..1 units', () => {
    expect(toFraction({ x: 200, y: 250, width: 100, height: 100 }, area)).toEqual({
      x: 0.5,
      y: 0.5,
      width: 0.5,
      height: 0.25,
    });
  });

  test('fromFraction is the inverse of toFraction', () => {
    const r = { x: 130, y: 90, width: 40, height: 80 };
    const back = fromFraction(toFraction(r, area), area);
    expect(back.x).toBeCloseTo(r.x);
    expect(back.y).toBeCloseTo(r.y);
    expect(back.width).toBeCloseTo(r.width);
    expect(back.height).toBeCloseTo(r.height);
  });
});

describe('detectDirection', () => {
  test('Urdu / Arabic script is rtl', () => {
    expect(detectDirection('علی احمد')).toBe('rtl');
  });
  test('Latin is ltr', () => {
    expect(detectDirection('Ali Ahmed')).toBe('ltr');
  });
  test('emoji only is ltr', () => {
    expect(detectDirection('🔥')).toBe('ltr');
  });
  test('mixed text starting with Latin but containing Urdu is rtl', () => {
    expect(detectDirection('Team علی')).toBe('rtl');
  });
});
