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
