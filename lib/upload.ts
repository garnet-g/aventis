import sharp, { type Metadata } from 'sharp';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** A small PNG can decompress to gigabytes; cap the decoded size. */
export const MAX_UPLOAD_PIXELS = 40_000_000;
import { MIN_UPLOAD_SIDE_PX } from '@/lib/uploadLimits';

export { MIN_UPLOAD_SIDE_PX };
/** Print areas are at most ~1,900 px at 150 DPI, so anything beyond this only costs storage and memory. */
export const MAX_STORED_SIDE_PX = 3600;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];

export type UploadMeta = { mime: string; bytes: number; widthPx: number; heightPx: number };
export type UploadResult = { ok: true } | { ok: false; reason: string };

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** True when the declared Content-Length already exceeds the cap, so the body is never buffered. */
export function declaredSizeTooLarge(contentLength: string | null): boolean {
  const n = Number(contentLength);
  return Number.isFinite(n) && n > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES;
}

export function validateUpload(meta: UploadMeta): UploadResult {
  if (!ALLOWED_MIME.includes(meta.mime)) return { ok: false, reason: 'Only PNG, JPG or WebP images are allowed.' };
  if (!Number.isFinite(meta.bytes) || meta.bytes <= 0) return { ok: false, reason: 'The file is empty.' };
  if (meta.bytes > MAX_UPLOAD_BYTES) return { ok: false, reason: 'The image is larger than 10 MB.' };
  if (![meta.widthPx, meta.heightPx].every((n) => Number.isFinite(n) && n > 0)) {
    return { ok: false, reason: 'The file is not a valid image.' };
  }
  if (meta.widthPx * meta.heightPx > MAX_UPLOAD_PIXELS) {
    return { ok: false, reason: 'The image is too large in pixels. Use an image under 40 megapixels.' };
  }
  if (Math.min(meta.widthPx, meta.heightPx) < MIN_UPLOAD_SIDE_PX) {
    return { ok: false, reason: `The image is too small to print. Use an image at least ${MIN_UPLOAD_SIDE_PX} pixels on each side.` };
  }
  return { ok: true };
}

export type NormalizedUpload =
  | { ok: true; buffer: Buffer; mime: 'image/png' | 'image/jpeg'; ext: 'png' | 'jpg'; widthPx: number; heightPx: number }
  | { ok: false; reason: string };

/**
 * Reads the real bytes (the client's claimed type and size are never trusted), validates them, and returns the
 * image in the form we store: upright (EXIF rotation applied), no larger than 3600 px, as PNG or JPG.
 */
export async function normalizeUpload(bytes: Buffer): Promise<NormalizedUpload> {
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: 268_402_689 }).metadata();
  } catch {
    return { ok: false, reason: bytes.length === 0 ? 'The file is empty.' : 'The file is not a valid image.' };
  }
  const mime = meta.format === 'png' ? 'image/png' : meta.format === 'jpeg' ? 'image/jpeg' : meta.format === 'webp' ? 'image/webp' : `image/${meta.format}`;
  // Phone photos are often stored sideways with an orientation flag (5-8 mean width and height swap).
  const swapped = (meta.orientation ?? 1) >= 5;
  const check = validateUpload({
    mime,
    bytes: bytes.length,
    widthPx: (swapped ? meta.height : meta.width) ?? NaN,
    heightPx: (swapped ? meta.width : meta.height) ?? NaN,
  });
  if (!check.ok) return check;

  const pipeline = sharp(bytes, { limitInputPixels: 268_402_689 })
    .rotate() // applies EXIF orientation and drops the flag, so the server and the browser agree which way is up
    .resize({ width: MAX_STORED_SIDE_PX, height: MAX_STORED_SIDE_PX, fit: 'inside', withoutEnlargement: true });
  const asJpeg = meta.format === 'jpeg';
  const out = await (asJpeg ? pipeline.jpeg({ quality: 92 }) : pipeline.png()).toBuffer({ resolveWithObject: true });
  return {
    ok: true,
    buffer: out.data,
    mime: asJpeg ? 'image/jpeg' : 'image/png',
    ext: asJpeg ? 'jpg' : 'png',
    widthPx: out.info.width,
    heightPx: out.info.height,
  };
}
