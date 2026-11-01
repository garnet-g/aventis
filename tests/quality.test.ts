import { describe, expect, test } from 'vitest';
import { printQuality } from '@/lib/quality';

describe('printQuality', () => {
  test('1654 px across 28 cm is about 150 DPI and rated great', () => {
    const q = printQuality(1654, 28);
    expect(q.dpi).toBeGreaterThanOrEqual(149);
    expect(q.dpi).toBeLessThanOrEqual(151);
    expect(q.level).toBe('great');
  });

  test('1200 px across 28 cm is about 109 DPI and rated ok', () => {
    expect(printQuality(1200, 28).level).toBe('ok');
  });

  test('600 px across 28 cm is about 54 DPI and rated low', () => {
    expect(printQuality(600, 28).level).toBe('low');
  });

  test('the same image printed smaller gets a better rating', () => {
    expect(printQuality(800, 28).level).toBe('low');
    expect(printQuality(800, 10).level).toBe('great');
  });

  test('a zero, negative or missing size is rated low instead of crashing', () => {
    expect(printQuality(1000, 0).level).toBe('low');
    expect(printQuality(NaN, 10).level).toBe('low');
    expect(printQuality(0, 10).level).toBe('low');
  });
});
