import sharp, { type Metadata } from 'sharp';
import { MIN_DPI, type PrintArea } from '@/lib/catalog';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/jpeg'];

export type UploadMeta = { mime: string; bytes: number; widthPx: number; heightPx: number };
export type UploadResult = { ok: true } | { ok: false; reason: string };

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** True when the declared Content-Length already exceeds the cap, so the body is never buffered. */
export function declaredSizeTooLarge(contentLength: string | null): boolean {
  const n = Number(contentLength);
  return Number.isFinite(n) && n > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES;
}

export function minWidthPx(area: PrintArea): number {
  return Math.ceil(MIN_DPI * (area.widthCm / 2.54));
}

export function validateUpload(meta: UploadMeta, area: PrintArea): UploadResult {
  if (!ALLOWED_MIME.includes(meta.mime)) return { ok: false, reason: 'Only PNG or JPG images are allowed.' };
  if (!Number.isFinite(meta.bytes) || meta.bytes <= 0) return { ok: false, reason: 'The file is empty.' };
  if (meta.bytes > MAX_UPLOAD_BYTES) return { ok: false, reason: 'The image is larger than 10 MB.' };
  if (![meta.widthPx, meta.heightPx].every((n) => Number.isFinite(n) && n > 0)) {
    return { ok: false, reason: 'The file is not a valid image.' };
  }
  const min = minWidthPx(area);
  if (meta.widthPx < min) {
    return {
      ok: false,
      reason: `The image is too small to print clearly. Use an image at least ${min} pixels wide.`,
    };
  }
  return { ok: true };
}

/** Reads the real bytes with sharp (the client's claimed type and size are never trusted). */
export async function checkUploadBytes(
  bytes: Buffer,
  area: PrintArea,
): Promise<{ ok: true; mime: string; widthPx: number; heightPx: number } | { ok: false; reason: string }> {
  let meta: Metadata;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    return { ok: false, reason: bytes.length === 0 ? 'The file is empty.' : 'The file is not a valid image.' };
  }
  const mime = meta.format === 'png' ? 'image/png' : meta.format === 'jpeg' ? 'image/jpeg' : `image/${meta.format}`;
  const result = validateUpload(
    { mime, bytes: bytes.length, widthPx: meta.width ?? NaN, heightPx: meta.height ?? NaN },
    area,
  );
  return result.ok ? { ok: true, mime, widthPx: meta.width!, heightPx: meta.height! } : result;
}
