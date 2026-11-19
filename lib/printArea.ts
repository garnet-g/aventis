export type Rect = { x: number; y: number; width: number; height: number };

/** Shrinks (keeping aspect ratio) if the rect is larger than the area, then moves it fully inside. */
export function clampToPrintArea(rect: Rect, area: Rect): Rect {
  const scale = Math.min(1, area.width / rect.width, area.height / rect.height);
  const width = rect.width * scale;
  const height = rect.height * scale;
  const x = Math.min(Math.max(rect.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(rect.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

/**
 * The box a layer really covers once turned, as fractions of the print area. Layers store their un-turned box plus
 * an angle (that is how the printer file draws them), so a turned item's stored box can poke past the edge while the
 * item itself is inside. `aspect` is the print area's width / height in cm: turning happens in real units, not in
 * fractions of a non-square area.
 */
export function turnedBounds(rect: Rect, rotationDeg: number, aspect: number): Rect {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = rect.width * aspect; // in units of the area's height
  const h = rect.height;
  const halfX = (w * cos + h * sin) / 2 / aspect;
  const halfY = (w * sin + h * cos) / 2;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return { x: cx - halfX, y: cy - halfY, width: halfX * 2, height: halfY * 2 };
}

/** Small slack for rounding between the editor's measurements and these. */
const INSIDE_SLACK = 0.005;

/** True when a layer, turned as it will print, stays inside the print area. */
export function layerFitsArea(layer: { rect: Rect; rotation: number }, aspect: number): boolean {
  const b = turnedBounds(layer.rect, layer.rotation, aspect);
  return b.x >= -INSIDE_SLACK && b.y >= -INSIDE_SLACK && b.x + b.width <= 1 + INSIDE_SLACK && b.y + b.height <= 1 + INSIDE_SLACK;
}
