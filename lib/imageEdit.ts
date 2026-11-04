import type { Rect } from '@/lib/printArea';
import { MIN_UPLOAD_SIDE_PX } from '@/lib/uploadLimits';

/** The model that cuts people out of photos. Apache-2.0, about 7 MB, and it runs inside the customer's browser. */
export const BACKGROUND_MODEL = 'Xenova/modnet';
/** Photos are shrunk to this before the model runs, which keeps phones fast and from running out of memory. */
export const BACKGROUND_MAX_SIDE_PX = 1600;

export type PixelBox = { sx: number; sy: number; sw: number; sh: number };

/** Turns a crop drawn as fractions (0..1) of the picture into whole pixels, kept inside the picture. */
export function cropPixels(natural: { width: number; height: number }, crop: Rect): PixelBox {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const sx = clamp(Math.round(crop.x * natural.width), 0, natural.width - 1);
  const sy = clamp(Math.round(crop.y * natural.height), 0, natural.height - 1);
  const sw = clamp(Math.round(crop.width * natural.width), 1, natural.width - sx);
  const sh = clamp(Math.round(crop.height * natural.height), 1, natural.height - sy);
  return { sx, sy, sw, sh };
}

/** The server refuses pictures that are too small to print, so say so before cropping rather than after uploading. */
export function cropTooSmall(box: PixelBox): boolean {
  return Math.min(box.sw, box.sh) < MIN_UPLOAD_SIDE_PX;
}

/** A size that fits inside `maxSide` on both sides, never larger than the original. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const k = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Works for both an on-page canvas and the off-screen one the background remover returns. */
const toBlob = (canvas: HTMLCanvasElement | OffscreenCanvas, type: 'image/png' | 'image/jpeg'): Promise<Blob> =>
  'convertToBlob' in canvas
    ? canvas.convertToBlob({ type, quality: 0.92 })
    : new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the picture.'))), type, 0.92));

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  return img;
}

/** Cuts the chosen part out of a picture at full resolution. Pictures with see-through areas stay PNG. */
export async function cropToBlob(url: string, crop: Rect, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const img = await loadImage(url);
  const { sx, sy, sw, sh } = cropPixels({ width: img.naturalWidth, height: img.naturalHeight }, crop);
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return toBlob(canvas, type);
}

/** Removes the background and returns a PNG with a see-through background. The model is downloaded on first use. */
export async function removeBackgroundToBlob(url: string, onStatus?: (message: string) => void): Promise<Blob> {
  const img = await loadImage(url);
  const size = fitWithin(img.naturalWidth, img.naturalHeight, BACKGROUND_MAX_SIDE_PX);
  const source = document.createElement('canvas');
  source.width = size.width;
  source.height = size.height;
  source.getContext('2d')!.drawImage(img, 0, 0, size.width, size.height);

  onStatus?.('Getting the background remover ready (only slow the first time)…');
  // Loaded only now: the library and model are large and most customers never use this.
  const { pipeline, RawImage } = await import('@huggingface/transformers');
  const remover = await pipeline('background-removal', BACKGROUND_MODEL, { dtype: 'uint8' });
  onStatus?.('Removing the background…');
  const out = await remover(RawImage.fromCanvas(source));
  return toBlob(out.toCanvas() as HTMLCanvasElement | OffscreenCanvas, 'image/png');
}
