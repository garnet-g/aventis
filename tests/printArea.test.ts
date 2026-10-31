import { describe, expect, test } from 'vitest';
import { clampToPrintArea, type Rect } from '@/lib/printArea';

const area: Rect = { x: 100, y: 100, width: 200, height: 300 };

describe('clampToPrintArea', () => {
  test('rect already inside is unchanged', () => {
    const r: Rect = { x: 120, y: 150, width: 50, height: 60 };
    expect(clampToPrintArea(r, area)).toEqual(r);
  });

  test('rect partly outside area is moved inside', () => {
    expect(clampToPrintArea({ x: 250, y: 50, width: 100, height: 100 }, area)).toEqual({
      x: 200,
      y: 100,
      width: 100,
      height: 100,
    });
  });

  test('rect larger than area shrinks to fit keeping aspect ratio', () => {
    const out = clampToPrintArea({ x: 0, y: 0, width: 400, height: 300 }, area);
    expect(out.width).toBe(200);
    expect(out.height).toBe(150);
    expect(out.x).toBe(100);
    expect(out.y).toBe(100);
    expect(out.width / out.height).toBeCloseTo(400 / 300);
  });

  test('tall rect larger than area shrinks by the limiting side', () => {
    const out = clampToPrintArea({ x: 150, y: 150, width: 100, height: 600 }, area);
    expect(out.height).toBe(300);
    expect(out.width).toBe(50);
    expect(out.y).toBe(100);
  });
});
