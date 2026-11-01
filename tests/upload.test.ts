import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { declaredSizeTooLarge, MAX_UPLOAD_BYTES, normalizeUpload, validateUpload } from '@/lib/upload';

const good = { mime: 'image/png', bytes: 200_000, widthPx: 2000, heightPx: 2000 };

describe('validateUpload', () => {
  test('valid png passes', () => {
    expect(validateUpload(good)).toEqual({ ok: true });
  });

  test('gif is rejected with a format message', () => {
    const r = validateUpload({ ...good, mime: 'image/gif' });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.reason).toMatch(/PNG, JPG or WebP/);
  });

  test('11 MB png is rejected with a size message', () => {
    const r = validateUpload({ ...good, bytes: 11 * 1024 * 1024 });
    expect(r.ok === false && r.reason).toMatch(/10 MB/);
  });

  test('a tiny image (under 300 px on its shorter side) is rejected and the message says why', () => {
    const r = validateUpload({ ...good, widthPx: 2000, heightPx: 250 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/300/);
  });

  test('ordinary everyday images are accepted: small logo, WhatsApp photo, screenshot', () => {
    for (const [w, h] of [[800, 800], [1280, 960], [1170, 2532], [640, 480]]) {
      expect(validateUpload({ ...good, widthPx: w, heightPx: h }), `${w}x${h}`).toEqual({ ok: true });
    }
  });

  test('webp is an accepted format', () => {
    expect(validateUpload({ ...good, mime: 'image/webp' })).toEqual({ ok: true });
  });

  test('an image with more than 40 megapixels is rejected (decompression-bomb guard)', () => {
    const r = validateUpload({ ...good, widthPx: 9000, heightPx: 9000 });
    expect(r.ok === false && r.reason).toMatch(/too large/i);
    expect(validateUpload({ ...good, widthPx: 6000, heightPx: 6000 })).toEqual({ ok: true });
  });

  test('file with image mime but 0 bytes or NaN dimensions is rejected, not thrown', () => {
    expect(validateUpload({ ...good, bytes: 0 }).ok).toBe(false);
    expect(validateUpload({ ...good, widthPx: NaN }).ok).toBe(false);
    expect(validateUpload({ ...good, heightPx: 0 }).ok).toBe(false);
  });
});

describe('declaredSizeTooLarge (rejects before the body is buffered)', () => {
  test('a content-length above the limit plus multipart overhead is too large', () => {
    expect(declaredSizeTooLarge(String(MAX_UPLOAD_BYTES + 2 * 1024 * 1024))).toBe(true);
  });

  test('a content-length at the limit plus small overhead is fine', () => {
    expect(declaredSizeTooLarge(String(MAX_UPLOAD_BYTES + 1024))).toBe(false);
  });

  test('a missing or garbage content-length is not trusted as too large (file size is checked after)', () => {
    expect(declaredSizeTooLarge(null)).toBe(false);
    expect(declaredSizeTooLarge('abc')).toBe(false);
  });
});

describe('normalizeUpload (reads the real bytes, never trusts the client)', () => {
  const solid = (w: number, h: number) => ({ create: { width: w, height: h, channels: 3 as const, background: '#fff' } });

  test('upload of a text file renamed .png is rejected with a message', async () => {
    const r = await normalizeUpload(Buffer.from('this is not an image'));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/valid image/i);
  });

  test('empty buffer is rejected, not thrown', async () => {
    expect((await normalizeUpload(Buffer.alloc(0))).ok).toBe(false);
  });

  test('a small logo is accepted and stays a png', async () => {
    const png = await sharp(solid(800, 800)).png().toBuffer();
    const r = await normalizeUpload(png);
    expect(r).toMatchObject({ ok: true, mime: 'image/png', ext: 'png', widthPx: 800, heightPx: 800 });
  });

  test('an image under 300 px on a side is rejected', async () => {
    const png = await sharp(solid(200, 200)).png().toBuffer();
    expect((await normalizeUpload(png)).ok).toBe(false);
  });

  test('webp is converted to png', async () => {
    const webp = await sharp(solid(900, 600)).webp().toBuffer();
    const r = await normalizeUpload(webp);
    expect(r).toMatchObject({ ok: true, mime: 'image/png', ext: 'png', widthPx: 900, heightPx: 600 });
    expect((await sharp((r as { buffer: Buffer }).buffer).metadata()).format).toBe('png');
  });

  test('gif and other formats are still rejected', async () => {
    const gif = await sharp(solid(900, 600)).gif().toBuffer();
    const r = await normalizeUpload(gif);
    expect(r.ok === false && r.reason).toMatch(/PNG, JPG or WebP/);
  });

  test('a phone photo stored sideways (EXIF orientation 6) is turned upright for good', async () => {
    // stored 800x600 but flagged "rotate 90 degrees" so it is displayed 600x800
    const sideways = await sharp(solid(800, 600)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const r = await normalizeUpload(sideways);
    expect(r).toMatchObject({ ok: true, mime: 'image/jpeg', ext: 'jpg', widthPx: 600, heightPx: 800 });
    const meta = await sharp((r as { buffer: Buffer }).buffer).metadata();
    expect([meta.width, meta.height]).toEqual([600, 800]);
    expect(meta.orientation ?? 1).toBe(1);
  });

  test('a huge photo is scaled down to at most 3600 px on its longest side', async () => {
    const big = await sharp(solid(6000, 4000)).jpeg({ quality: 40 }).toBuffer();
    const r = await normalizeUpload(big);
    expect(r).toMatchObject({ ok: true, widthPx: 3600, heightPx: 2400 });
  });

  test('a smaller image is never enlarged', async () => {
    const png = await sharp(solid(1000, 700)).png().toBuffer();
    expect(await normalizeUpload(png)).toMatchObject({ widthPx: 1000, heightPx: 700 });
  });
});
