import { MIN_DPI } from '@/lib/catalog';

export type PrintQuality = { dpi: number; level: 'great' | 'ok' | 'low' };

const OK_DPI = 100;

/** How sharp an image will print: its pixels divided by the printed width in inches. */
export function printQuality(srcWidthPx: number, printedWidthCm: number): PrintQuality {
  const valid = [srcWidthPx, printedWidthCm].every((n) => Number.isFinite(n) && n > 0);
  if (!valid) return { dpi: 0, level: 'low' };
  const dpi = srcWidthPx / (printedWidthCm / 2.54);
  return { dpi, level: dpi >= MIN_DPI ? 'great' : dpi >= OK_DPI ? 'ok' : 'low' };
}
