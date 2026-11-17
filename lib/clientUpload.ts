/**
 * POSTs a form and reports upload progress (fetch cannot). Resolves with the HTTP status and the JSON body
 * (null if the response was not JSON); rejects only when the network itself fails.
 */
export function postFormWithProgress(
  url: string,
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.response ?? null });
    xhr.onerror = () => reject(new Error('Network error while uploading.'));
    xhr.ontimeout = () => reject(new Error('Network timeout while uploading.'));
    xhr.send(form);
  });
}

/** 4000 px on the long side prints the largest area (32 cm) at over 300 dpi. */
export const PRINT_MAX_PX = 4000;
const SHRINK_OVER_BYTES = 2 * 1024 * 1024;

/** Whether a photo should be shrunk before upload: only big JPEGs (photos), never PNGs, which may be transparent. */
export function shouldShrink(file: { type: string; size: number }, dims?: { width: number; height: number }) {
  if (file.type !== 'image/jpeg') return false;
  return file.size > SHRINK_OVER_BYTES || (dims !== undefined && Math.max(dims.width, dims.height) > PRINT_MAX_PX);
}

/** The size to shrink to: the long side capped at PRINT_MAX_PX, shape unchanged. */
export function shrinkSize(width: number, height: number, max = PRINT_MAX_PX) {
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/**
 * Shrinks a big phone photo in the browser before it is sent: far less mobile data, same print quality. Upright
 * (phone rotation applied) and re-encoded as a high-quality JPEG. Anything that goes wrong sends the original.
 */
export async function shrinkForUpload(file: File): Promise<File> {
  if (!shouldShrink(file) || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = shrinkSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
