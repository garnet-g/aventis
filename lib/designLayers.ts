import type { Rect } from '@/lib/printArea';

/** rect values are fractions (0..1) of the print area; fontSize is a fraction of the print-area width; rotation is in degrees. */
export type DesignLayer =
  | { kind: 'image'; uploadPath: string; rect: Rect; rotation: number; flipX?: boolean; flipY?: boolean }
  | {
      kind: 'text';
      text: string;
      font: string;
      fill: string;
      direction: 'ltr' | 'rtl';
      fontSize: number;
      rect: Rect;
      rotation: number;
    };
