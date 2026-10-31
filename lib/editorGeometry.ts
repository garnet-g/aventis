import { catalog, type ProductId } from '@/lib/catalog';
import type { Rect } from '@/lib/printArea';

// The editor canvas shows the 800x1000 garment photo at half size.
export const CANVAS_W = 400;
export const CANVAS_H = 500;

// PLACEHOLDER: calibrate against the real garment photos (canvas pixels per real-world cm on the garment).
const PX_PER_CM = 4.4;
const COLLAR_Y = 60;

/** The fixed print area in canvas pixels, centered on the garment. */
export function printAreaRect(product: ProductId): Rect {
  const a = catalog[product].printArea;
  const width = a.widthCm * PX_PER_CM;
  return {
    x: (CANVAS_W - width) / 2,
    y: COLLAR_Y + a.topOffsetCm * PX_PER_CM,
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
