import { describe, expect, test } from 'vitest';
import { cropPixels, cropTooSmall, fitWithin } from '@/lib/imageEdit';

describe('cropPixels', () => {
  const natural = { width: 2000, height: 1000 };
  test('turns fractions into whole pixels', () => {
    expect(cropPixels(natural, { x: 0.25, y: 0.5, width: 0.5, height: 0.25 })).toEqual({ sx: 500, sy: 500, sw: 1000, sh: 250 });
  });
  test('the whole picture is the whole picture', () => {
    expect(cropPixels(natural, { x: 0, y: 0, width: 1, height: 1 })).toEqual({ sx: 0, sy: 0, sw: 2000, sh: 1000 });
  });
  test('a box that runs past the edge is pulled back inside', () => {
    const box = cropPixels(natural, { x: 0.9, y: 0.9, width: 0.5, height: 0.5 });
    expect(box.sx + box.sw).toBeLessThanOrEqual(2000);
    expect(box.sy + box.sh).toBeLessThanOrEqual(1000);
    expect(box.sw).toBeGreaterThan(0);
  });
  test('a negative or empty box still gives at least one pixel', () => {
    expect(cropPixels(natural, { x: -1, y: -1, width: 0, height: 0 })).toEqual({ sx: 0, sy: 0, sw: 1, sh: 1 });
  });
});

describe('cropTooSmall', () => {
  test('the server needs 300 px on the shorter side', () => {
    expect(cropTooSmall({ sx: 0, sy: 0, sw: 299, sh: 900 })).toBe(true);
    expect(cropTooSmall({ sx: 0, sy: 0, sw: 900, sh: 299 })).toBe(true);
    expect(cropTooSmall({ sx: 0, sy: 0, sw: 300, sh: 300 })).toBe(false);
  });
});

describe('fitWithin', () => {
  test('shrinks the longer side to the limit and keeps the shape', () => expect(fitWithin(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 }));
  test('never enlarges', () => expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 }));
});
