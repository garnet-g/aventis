import type { Rect } from '@/lib/printArea';

/** rect values are fractions (0..1) of the print area; rotation is in degrees. */
export type DesignLayer =
  | { kind: 'image'; uploadPath: string; rect: Rect; rotation: number }
  | {
      kind: 'text';
      text: string;
      font: string;
      fill: string;
      direction: 'ltr' | 'rtl';
      rect: Rect;
      rotation: number;
    };
