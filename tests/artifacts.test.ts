import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { FONTS, type FontKey } from '@/lib/fonts';
import { designPixelSize, generateArtifacts, renderDesignPng, renderMockupPng, renderTextOverlay, type ArtifactStorage } from '@/lib/artifacts';
import type { DesignLayer } from '@/lib/designLayers';

const item = { product: 'tee', color: 'white' } as const;
const TEE_W = 1654; // 28 cm at 150 DPI
const TEE_H = 1890; // 32 cm at 150 DPI

async function red(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#ff0000' } }).png().toBuffer();
}

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

async function opaquePixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  let minX = info.width, maxX = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 40) {
        count++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }
  return { count, minX, maxX };
}

const imageLayer = (rect = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, rotation = 0): DesignLayer => ({
  kind: 'image', uploadPath: 'u/d/f.png', rect, rotation,
});

const textLayer = (text: string, direction: 'ltr' | 'rtl' = 'ltr'): DesignLayer => ({
  kind: 'text', text, font: 'sans', fill: '#000000', direction, fontSize: 0.12,
  rect: { x: 0.1, y: 0.4, width: 0.8, height: 0.2 }, rotation: 0,
});

const loader = async () => red(300, 300);

describe('renderDesignPng', () => {
  test('design PNG dimensions equal print area at MIN_DPI', async () => {
    const png = await renderDesignPng(item, [imageLayer()], loader);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([TEE_W, TEE_H]);
  });

  test('design PNG has transparent pixels outside placed layers and the image inside', async () => {
    const png = await renderDesignPng(item, [imageLayer()], loader);
    expect((await pixel(png, 5, 5)).a).toBe(0);
    const center = await pixel(png, TEE_W / 2, TEE_H / 2);
    expect(center).toMatchObject({ r: 255, g: 0, b: 0, a: 255 });
  });

  test('a rotated image that pokes past the print area does not throw and stays clipped to the area', async () => {
    const png = await renderDesignPng(item, [imageLayer({ x: 0.0, y: 0.0, width: 1, height: 1 }, 30)], loader);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([TEE_W, TEE_H]);
  });

  test('a flipped image layer is mirrored (left to right and top to bottom)', async () => {
    const red = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ff0000' } }).png().toBuffer();
    // left half red, right half blue
    const lr = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#0000ff' } }).composite([{ input: red, left: 0, top: 0 }]).png().toBuffer();
    // top half red, bottom half blue
    const tb = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#0000ff' } }).composite([{ input: red, left: 0, top: 0 }]).png().toBuffer();
    const full = { x: 0, y: 0, width: 1, height: 1 };
    const layer = (extra: object): DesignLayer => ({ kind: 'image', uploadPath: 'u/d/f.png', rect: full, rotation: 0, ...extra }) as DesignLayer;
    const left = (png: Buffer) => pixel(png, 50, TEE_H / 2);
    const top = (png: Buffer) => pixel(png, TEE_W / 2, 50);
    expect(await left(await renderDesignPng(item, [layer({})], async () => lr))).toMatchObject({ r: 255, b: 0 });
    expect(await left(await renderDesignPng(item, [layer({ flipX: true })], async () => lr))).toMatchObject({ r: 0, b: 255 });
    expect(await top(await renderDesignPng(item, [layer({})], async () => tb))).toMatchObject({ r: 255, b: 0 });
    expect(await top(await renderDesignPng(item, [layer({ flipY: true })], async () => tb))).toMatchObject({ r: 0, b: 255 });
  });

  test('Arabic-script text layer produces real glyph pixels (not blank, not boxes)', async () => {
    const png = await renderDesignPng(item, [textLayer('علی احمد', 'rtl')], loader);
    const { count, minX, maxX } = await opaquePixels(png);
    expect(count).toBeGreaterThan(2000);
    expect(maxX - minX).toBeGreaterThan(TEE_W * 0.1);
  });

  test('Latin text layer produces glyph pixels', async () => {
    const png = await renderDesignPng(item, [textLayer('Wanjiku Mwangi')], loader);
    expect((await opaquePixels(png)).count).toBeGreaterThan(2000);
  });

  test('text containing markup characters is rendered literally, not interpreted', async () => {
    await expect(renderDesignPng(item, [textLayer('<b>A&B</b> <span')], loader)).resolves.toBeInstanceOf(Buffer);
  });

  test('a layer with no content in the print area still yields a valid transparent PNG', async () => {
    const png = await renderDesignPng(item, [], loader);
    expect((await opaquePixels(png)).count).toBe(0);
  });
});

/** Ink bounds and the average color of the opaque pixels. */
async function ink(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0, minX = info.width, maxX = 0, r = 0, g = 0, b = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] > 200) {
        n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
    }
  }
  return { n, width: maxX - minX, r: r / n, g: g / n, b: b / n };
}

const styled = (text: string, font: string, fill = '#000000', direction: 'ltr' | 'rtl' = 'ltr'): DesignLayer => ({
  kind: 'text', text, font: font as FontKey, fill, direction, fontSize: 0.12, rect: { x: 0.05, y: 0.4, width: 0.9, height: 0.2 }, rotation: 0,
});

describe('text styling is what gets printed', () => {
  test.each(Object.keys(FONTS) as FontKey[])('the %s font renders real glyphs', async (key) => {
    const rtl = FONTS[key].script === 'arabic';
    const png = await renderDesignPng(item, [styled(rtl ? 'مرحبا' : 'Wanjiku Mwangi', key, '#000000', rtl ? 'rtl' : 'ltr')], loader);
    expect((await ink(png)).n, key).toBeGreaterThan(1500);
  });

  test('a different font changes the printed shape (condensed jersey vs flowing script)', async () => {
    const jersey = await ink(await renderDesignPng(item, [styled('Wanjiku Mwangi', 'jersey')], loader));
    const script = await ink(await renderDesignPng(item, [styled('Wanjiku Mwangi', 'script')], loader));
    expect(Math.abs(jersey.width - script.width) / Math.max(jersey.width, script.width)).toBeGreaterThan(0.1);
  });

  test('the chosen text color is the color printed', async () => {
    const png = await renderDesignPng(item, [styled('Wanjiku Mwangi', 'display', '#e5412a')], loader);
    const c = await ink(png);
    expect(c.r).toBeGreaterThan(200);
    expect(c.g).toBeLessThan(110);
    expect(c.b).toBeLessThan(90);
  });

  test('an unknown or mismatched font falls back to one that fits instead of failing', async () => {
    const odd = await renderDesignPng(item, [styled('Wanjiku Mwangi', 'Comic Papyrus')], loader);
    expect((await ink(odd)).n).toBeGreaterThan(1500);
    const arabicInLatinFont = await renderDesignPng(item, [styled('علی احمد', 'script', '#000000', 'rtl')], loader);
    expect((await ink(arabicInLatinFont)).n).toBeGreaterThan(1500);
  });
});

describe('renderTextOverlay stays bounded', () => {
  const { width: W, height: H } = designPixelSize('tee');
  const layer = (text: string, fontSize: number, width = 0.9): Extract<DesignLayer, { kind: 'text' }> => ({
    kind: 'text', text, font: 'sans', fill: '#000000', direction: 'ltr', fontSize,
    rect: { x: 0.05, y: 0.05, width, height: 0.2 }, rotation: 0,
  });

  test('the largest font with the longest text is shrunk to fit the print area', async () => {
    const png = await renderTextOverlay(layer('W'.repeat(60), 1), W, H);
    const meta = await sharp(png).metadata();
    expect(meta.width!).toBeLessThanOrEqual(Math.ceil(W * 1.05));
    expect(meta.height!).toBeLessThanOrEqual(Math.ceil(H * 1.05));
  }, 30_000);

  test('a very narrow box with long text cannot grow past the print area either', async () => {
    const png = await renderTextOverlay(layer('W'.repeat(60), 0.5, 0.01), W, H);
    const meta = await sharp(png).metadata();
    expect(meta.height!).toBeLessThanOrEqual(Math.ceil(H * 1.05));
  }, 30_000);

  test('normal text keeps its requested size', async () => {
    const meta = await sharp(await renderTextOverlay(layer('Wanjiku Mwangi', 0.12), W, H)).metadata();
    // The overlay is ink-tight: ascender text such as "Ali Khan" is about 0.75 of the font size tall.
    expect(meta.height!).toBeGreaterThanOrEqual(Math.round(0.12 * W * 0.7));
    expect(meta.height!).toBeLessThanOrEqual(Math.round(0.12 * W * 2.5));
  });
});

describe('the back side', () => {
  test('the back design file has the size of the back print area', async () => {
    const { width, height } = designPixelSize('tee', 'back');
    const png = await renderDesignPng({ ...item, side: 'back' }, [textLayer('Back')], loader);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([width, height]);
  });

  test('the back mockup is drawn on the back garment photo, not the front one', async () => {
    const png = await renderDesignPng(item, [], loader);
    const front = await renderMockupPng(item, png);
    const back = await renderMockupPng({ ...item, side: 'back' }, png);
    expect(Buffer.compare(front, back)).not.toBe(0);
    const meta = await sharp(back).metadata();
    expect([meta.width, meta.height]).toEqual([800, 1000]);
  });

  test('generateArtifacts makes four files when there is a back side and two when there is not', async () => {
    const files = new Map<string, Buffer>();
    const storage: ArtifactStorage = { upload: async (p, d) => void files.set(p, d) };
    const base = { orderId: 'o9', item, layers: [textLayer('Front')], loadImage: loader, storage };
    const two = await generateArtifacts(base);
    expect(two).toEqual({ mockupPath: 'o9/mockup.png', designFilePath: 'o9/design.png' });
    expect(files.size).toBe(2);
    const four = await generateArtifacts({ ...base, backLayers: [textLayer('Back')] });
    expect(four).toEqual({
      mockupPath: 'o9/mockup.png',
      designFilePath: 'o9/design.png',
      backMockupPath: 'o9/back-mockup.png',
      backDesignFilePath: 'o9/back-design.png',
    });
    expect([...files.keys()].sort()).toEqual(['o9/back-design.png', 'o9/back-mockup.png', 'o9/design.png', 'o9/mockup.png']);
  });
});

describe('renderMockupPng', () => {
  test("mockup PNG has the garment's dimensions and shows the design on it", async () => {
    const design = await renderDesignPng(item, [imageLayer()], loader);
    const mock = await renderMockupPng(item, design);
    const meta = await sharp(mock).metadata();
    expect([meta.width, meta.height]).toEqual([800, 1000]);
    // the print area on the 800x1000 photo is centered horizontally; its middle should now be red
    const p = await pixel(mock, 400, 330);
    expect(p).toMatchObject({ r: 255, g: 0, b: 0 });
    // the corner of the photo is untouched garment background
    expect((await pixel(mock, 5, 5)).r).toBeGreaterThan(200);
  });
});

describe('generateArtifacts', () => {
  const memoryStorage = () => {
    const files = new Map<string, Buffer>();
    const storage: ArtifactStorage = { upload: async (p, d) => void files.set(p, d) };
    return { files, storage };
  };

  test('stores a mockup and a design file under the order id', async () => {
    const { files, storage } = memoryStorage();
    const out = await generateArtifacts({ orderId: 'o1', item, layers: [imageLayer()], loadImage: loader, storage });
    expect(out).toEqual({ mockupPath: 'o1/mockup.png', designFilePath: 'o1/design.png' });
    expect([...files.keys()].sort()).toEqual(['o1/design.png', 'o1/mockup.png']);
  });

  test('rerunning generation for the same order overwrites rather than duplicates files', async () => {
    const { files, storage } = memoryStorage();
    const args = { orderId: 'o1', item, layers: [imageLayer()], loadImage: loader, storage };
    await generateArtifacts(args);
    await generateArtifacts(args);
    expect(files.size).toBe(2);
  });
});
