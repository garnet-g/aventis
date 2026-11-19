import { describe, expect, test } from 'vitest';
import { clampToPrintArea, layerFitsArea, turnedBounds, type Rect } from '@/lib/printArea';

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

describe('turned items', () => {
  // The T-shirt front is 27 x 32 cm.
  const tee = 27 / 32;

  test('an un-turned item covers exactly its box', () => {
    const r = { x: 0.1, y: 0.2, width: 0.5, height: 0.3 };
    const b = turnedBounds(r, 0, tee);
    expect(b.x).toBeCloseTo(0.1);
    expect(b.width).toBeCloseTo(0.5);
    expect(layerFitsArea({ rect: r, rotation: 0 }, tee)).toBe(true);
  });

  test('a wide banner turned upright fits even though its stored box pokes out the top', () => {
    // measured in the editor: wrapped text 22.5 x 27 cm, turned 90° it is 27 cm wide and 22.5 cm tall
    const rect = { x: 0.0828, y: -0.0698, width: 0.8345, height: 0.84375 };
    expect(layerFitsArea({ rect, rotation: 0 }, tee)).toBe(false); // the stored box alone looks outside
    expect(layerFitsArea({ rect, rotation: 90 }, tee)).toBe(true);
    const b = turnedBounds(rect, 90, tee);
    expect(b.width).toBeCloseTo(1, 3);
    expect(b.y).toBeCloseTo(0, 2);
  });

  test('a turned item that really sticks out is refused', () => {
    expect(layerFitsArea({ rect: { x: 0.2, y: 0.4, width: 0.6, height: 0.2 }, rotation: 45 }, tee)).toBe(true);
    expect(layerFitsArea({ rect: { x: 0, y: 0.25, width: 1, height: 0.5 }, rotation: 45 }, tee)).toBe(false);
    expect(layerFitsArea({ rect: { x: 0.5, y: 0.5, width: 0.6, height: 0.2 }, rotation: 0 }, tee)).toBe(false);
  });
});
