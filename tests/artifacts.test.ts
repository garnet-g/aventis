import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
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
  kind: 'text', text, font: 'x', fill: '#000000', direction, fontSize: 0.12,
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

  test('Urdu text layer produces real glyph pixels (not blank, not boxes)', async () => {
    const png = await renderDesignPng(item, [textLayer('علی احمد', 'rtl')], loader);
    const { count, minX, maxX } = await opaquePixels(png);
    expect(count).toBeGreaterThan(2000);
    expect(maxX - minX).toBeGreaterThan(TEE_W * 0.1);
  });

  test('Latin text layer produces glyph pixels', async () => {
    const png = await renderDesignPng(item, [textLayer('Ali Khan')], loader);
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

describe('renderTextOverlay stays bounded', () => {
  const { width: W, height: H } = designPixelSize('tee');
  const layer = (text: string, fontSize: number, width = 0.9): Extract<DesignLayer, { kind: 'text' }> => ({
    kind: 'text', text, font: 'x', fill: '#000000', direction: 'ltr', fontSize,
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
    const meta = await sharp(await renderTextOverlay(layer('Ali Khan', 0.12), W, H)).metadata();
    // The overlay is ink-tight: ascender text such as "Ali Khan" is about 0.75 of the font size tall.
    expect(meta.height!).toBeGreaterThanOrEqual(Math.round(0.12 * W * 0.7));
    expect(meta.height!).toBeLessThanOrEqual(Math.round(0.12 * W * 2.5));
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
