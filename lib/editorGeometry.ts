import { printAreaFor, type ProductId, type Side } from '@/lib/catalog';
import type { Rect } from '@/lib/printArea';

// The editor canvas shows the 800x1000 garment photo at half size.
export const CANVAS_W = 400;
export const CANVAS_H = 500;

/**
 * How each garment picture maps to real life, in canvas pixels: how many pixels make one centimetre of fabric, where
 * print areas are measured down from (the collar seam; on a hoodie's back, the bottom of the hood), and the middle of
 * the garment (the model doesn't stand exactly in the centre).
 *
 * Measured on the photos (each side is 724 x 1086, padded to 869 wide, so canvas = (x + 72) * 0.4603, y * 0.4603):
 * the T-shirt body is about 415 px across below the sleeves, a size M's 51 cm chest, so 8.14 px per cm (3.75 on the
 * canvas). It is the same model and camera for the hoodies, so they share the scale. Collar seams: T-shirt front
 * y = 115, back y = 58; hoodie front neckline y = 126; the hood hangs to y = 278 on the back. Body middles: T-shirt
 * front x = 376, back x = 364; hoodie front x = 367, back x = 360.
 */
const PX_PER_CM = 3.75;
const GEOMETRY: Record<ProductId, Record<Side, { topY: number; centerX: number }>> = {
  tee: { front: { topY: 52.9, centerX: 206.4 }, back: { topY: 26.7, centerX: 200.7 } },
  hoodie: { front: { topY: 58, centerX: 202.1 }, back: { topY: 128, centerX: 198.6 } },
};

/** The fixed print area in canvas pixels, centered on the garment's body. */
export function printAreaRect(product: ProductId, side: Side = 'front'): Rect {
  const a = printAreaFor(product, side);
  const { topY, centerX } = GEOMETRY[product][side];
  const width = a.widthCm * PX_PER_CM;
  return {
    x: centerX - width / 2,
    y: topY + a.topOffsetCm * PX_PER_CM,
    width,
    height: a.heightCm * PX_PER_CM,
  };
}

/** Layer rects are stored as fractions (0..1) of the print area so they are independent of screen size. */
export function toFraction(r: Rect, area: Rect): Rect {
  return {
    x: (r.x - area.x) / area.width,
    y: (r.y - area.y) / area.height,
    width: r.width / area.width,
    height: r.height / area.height,
  };
}

export function fromFraction(f: Rect, area: Rect): Rect {
  return {
    x: area.x + f.x * area.width,
    y: area.y + f.y * area.height,
    width: f.width * area.width,
    height: f.height * area.height,
  };
}

const RTL_SCRIPT = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

export function detectDirection(text: string): 'ltr' | 'rtl' {
  return RTL_SCRIPT.test(text) ? 'rtl' : 'ltr';
}
