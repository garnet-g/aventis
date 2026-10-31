import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { catalog } from '@/lib/catalog';
import { checkUploadBytes, validateUpload } from '@/lib/upload';

const area = catalog.tee.printArea; // 28 cm wide -> 1654 px minimum at 150 DPI
const good = { mime: 'image/png', bytes: 200_000, widthPx: 2000, heightPx: 2000 };

describe('validateUpload', () => {
  test('valid png passes', () => {
    expect(validateUpload(good, area)).toEqual({ ok: true });
  });

  test('gif is rejected with a format message', () => {
    const r = validateUpload({ ...good, mime: 'image/gif' }, area);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.reason).toMatch(/PNG or JPG/);
  });

  test('11 MB png is rejected with a size message', () => {
    const r = validateUpload({ ...good, bytes: 11 * 1024 * 1024 }, area);
    expect(r.ok === false && r.reason).toMatch(/10 MB/);
  });

  test('image below MIN_DPI at the print width is rejected and the message states the minimum pixel width', () => {
    const r = validateUpload({ ...good, widthPx: 1000 }, area);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain('1654');
  });

  test('image exactly at the minimum width passes', () => {
    expect(validateUpload({ ...good, widthPx: 1654 }, area)).toEqual({ ok: true });
  });

  test('file with image mime but 0 bytes or NaN dimensions is rejected, not thrown', () => {
    expect(validateUpload({ ...good, bytes: 0 }, area).ok).toBe(false);
    expect(validateUpload({ ...good, widthPx: NaN }, area).ok).toBe(false);
    expect(validateUpload({ ...good, heightPx: 0 }, area).ok).toBe(false);
  });
});

describe('checkUploadBytes (reads the real bytes, never trusts the client)', () => {
  test('upload of a text file renamed .png is rejected with a message', async () => {
    const r = await checkUploadBytes(Buffer.from('this is not an image'), area);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/valid image/i);
  });

  test('empty buffer is rejected, not thrown', async () => {
    const r = await checkUploadBytes(Buffer.alloc(0), area);
    expect(r.ok).toBe(false);
  });

  test('a real large-enough png passes and reports its type', async () => {
    const png = await sharp({ create: { width: 1800, height: 1800, channels: 3, background: '#fff' } }).png().toBuffer();
    const r = await checkUploadBytes(png, area);
    expect(r).toMatchObject({ ok: true, mime: 'image/png', widthPx: 1800, heightPx: 1800 });
  });

  test('a real small png is rejected for resolution', async () => {
    const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#fff' } }).png().toBuffer();
    const r = await checkUploadBytes(png, area);
    expect(r.ok === false && r.reason).toContain('1654');
  });
});
