import { printAreaFor, type ProductId, type Side } from '@/lib/catalog';
import type { Rect } from '@/lib/printArea';

// The editor canvas shows the 800x1000 garment photo at half size.
export const CANVAS_W = 400;
export const CANVAS_H = 500;

/**
 * How each garment picture maps to real life, in canvas pixels: how many pixels make one centimetre of fabric, and
 * where the collar seam is (print areas are measured down from it).
 *
 * T-shirt front: measured on the photos (1122 x 1402). The body is about 620 px across just below the sleeves, which
 * is a size M's 51 cm chest (12.2 px per cm), and the front collar seam is at y = 142. At canvas scale (x 0.3565) that
 * is 4.33 px per cm and y = 51. The drawings (T-shirt back, hoodie) keep their placeholder scale until photographed.
 */
const GEOMETRY: Record<ProductId, Record<Side, { pxPerCm: number; collarY: number }>> = {
  tee: { front: { pxPerCm: 4.33, collarY: 51 }, back: { pxPerCm: 4.4, collarY: 60 } },
  hoodie: { front: { pxPerCm: 4.4, collarY: 60 }, back: { pxPerCm: 4.4, collarY: 60 } },
};

/** The fixed print area in canvas pixels, centered on the garment. */
export function printAreaRect(product: ProductId, side: Side = 'front'): Rect {
  const a = printAreaFor(product, side);
  const { pxPerCm, collarY } = GEOMETRY[product][side];
  const width = a.widthCm * pxPerCm;
  return {
    x: (CANVAS_W - width) / 2,
    y: collarY + a.topOffsetCm * pxPerCm,
    width,
    height: a.heightCm * pxPerCm,
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
