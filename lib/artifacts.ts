import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OverlayOptions, type SharpOptions } from 'sharp';
import { catalog, MIN_DPI, printAreaFor, type Color, type ProductId, type Side } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { printAreaRect } from '@/lib/editorGeometry';
import { resolveFont } from '@/lib/fonts';
import type { ArtifactPaths } from '@/lib/orders';

/** What to draw: a garment and, optionally, which side of it (the front by default). */
export type ArtifactItem = { product: ProductId; color: Color; side?: Side };
export type ImageLoader = (uploadPath: string) => Promise<Buffer>;
export interface ArtifactStorage {
  /** Must overwrite an existing file at the same path (regeneration must not duplicate files). */
  upload(path: string, data: Buffer, contentType: string): Promise<void>;
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
// The garment photos are 800x1000 while the editor canvas is 400x500.
const PHOTO_SCALE = 2;

export function designPixelSize(product: ProductId, side: Side = 'front') {
  const a = printAreaFor(product, side);
  return {
    width: Math.round((a.widthCm / 2.54) * MIN_DPI),
    height: Math.round((a.heightCm / 2.54) * MIN_DPI),
  };
}

const escapeMarkup = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const MAX_INPUT_PIXELS = 50_000_000;
const PREFLIGHT_FONT_PX = 16;

function textOptions(layer: Extract<DesignLayer, { kind: 'text' }>, fontPx: number, boxPx: number): SharpOptions {
  const font = resolveFont(layer.font, layer.direction); // an unknown or unsuitable font becomes one that fits
  // `rtl` is supported by sharp/libvips but missing from its type definitions.
  return {
    text: {
      text: `<span foreground="${layer.fill}">${escapeMarkup(layer.text)}</span>`,
      font: `${font.family} ${Math.max(1, Math.round(fontPx))}`,
      fontfile: path.join(process.cwd(), 'assets', 'fonts', font.file),
      width: Math.max(1, Math.round(boxPx)),
      align: 'center',
      rgba: true,
      dpi: 72, // 1 point = 1 pixel
      rtl: layer.direction === 'rtl',
    },
  } as unknown as SharpOptions;
}

/**
 * Renders a text layer at the size the customer chose. Rendered size grows linearly with font size, so a tiny
 * preflight render tells us how big the real one would be; if it would not fit inside the print area the font is
 * shrunk first. That bounds memory no matter what a (possibly hand-crafted) layer asks for.
 */
export async function renderTextOverlay(layer: Extract<DesignLayer, { kind: 'text' }>, W: number, H: number): Promise<Buffer> {
  let fontPx = layer.fontSize * W;
  const boxPx = layer.rect.width * W;
  for (let i = 0; i < 30 && fontPx > PREFLIGHT_FONT_PX; i++) {
    const k = fontPx / PREFLIGHT_FONT_PX;
    const { info } = await sharp(textOptions(layer, fontPx / k, boxPx / k)).png().toBuffer({ resolveWithObject: true });
    if (info.width * k <= W && info.height * k <= H) break;
    fontPx *= 0.8;
  }
  return sharp(textOptions(layer, fontPx, boxPx)).png().toBuffer();
}

/** Crops an overlay to the canvas bounds so compositing never needs negative offsets. */
async function clipToCanvas(png: Buffer, left: number, top: number, W: number, H: number) {
  const { width: w = 0, height: h = 0 } = await sharp(png).metadata();
  const cropL = Math.max(0, -left);
  const cropT = Math.max(0, -top);
  const cropW = Math.min(w, W - left) - cropL;
  const cropH = Math.min(h, H - top) - cropT;
  if (cropW <= 0 || cropH <= 0) return null;
  const input =
    cropL || cropT || cropW !== w || cropH !== h
      ? await sharp(png).extract({ left: cropL, top: cropT, width: cropW, height: cropH }).png().toBuffer()
      : png;
  return { input, left: Math.max(0, left), top: Math.max(0, top) };
}

/** Transparent PNG of exactly the print area at MIN_DPI, with every layer placed where the customer put it. */
export async function renderDesignPng(item: ArtifactItem, layers: DesignLayer[], loadImage: ImageLoader): Promise<Buffer> {
  const { width: W, height: H } = designPixelSize(item.product, item.side);
  const overlays: OverlayOptions[] = [];

  for (const layer of layers) {
    let png: Buffer;
    if (layer.kind === 'image') {
      let image = sharp(await loadImage(layer.uploadPath), { limitInputPixels: MAX_INPUT_PIXELS })
        .ensureAlpha()
        .resize(Math.max(1, Math.round(layer.rect.width * W)), Math.max(1, Math.round(layer.rect.height * H)), { fit: 'fill' });
      if (layer.flipX) image = image.flop(); // mirror left to right
      if (layer.flipY) image = image.flip(); // mirror top to bottom
      png = await image.png().toBuffer();
    } else {
      png = await renderTextOverlay(layer, W, H);
    }
    if (layer.rotation) png = await sharp(png).rotate(layer.rotation, { background: TRANSPARENT }).png().toBuffer();

    const { width: w = 0, height: h = 0 } = await sharp(png).metadata();
    const cx = (layer.rect.x + layer.rect.width / 2) * W;
    const cy = (layer.rect.y + layer.rect.height / 2) * H;
    const clipped = await clipToCanvas(png, Math.round(cx - w / 2), Math.round(cy - h / 2), W, H);
    if (clipped) overlays.push(clipped);
  }

  const base = sharp({ create: { width: W, height: H, channels: 4, background: TRANSPARENT } });
  return (overlays.length ? base.composite(overlays) : base).png().toBuffer();
}

/** The garment photo with the design placed in its print area. */
export async function renderMockupPng(item: ArtifactItem, designPng: Buffer): Promise<Buffer> {
  const garment = await readFile(path.join(process.cwd(), 'public', catalog[item.product].garmentImage(item.color, item.side)));
  const area = printAreaRect(item.product, item.side);
  const design = await sharp(designPng)
    .resize(Math.round(area.width * PHOTO_SCALE), Math.round(area.height * PHOTO_SCALE))
    .png()
    .toBuffer();
  return sharp(garment)
    .composite([{ input: design, left: Math.round(area.x * PHOTO_SCALE), top: Math.round(area.y * PHOTO_SCALE) }])
    .png()
    .toBuffer();
}

/**
 * Renders the files from the given layers (callers pass the order's snapshot) and stores them under the order id.
 * Two files for the front; two more for the back when the back is printed.
 */
export async function generateArtifacts(args: {
  orderId: string;
  item: ArtifactItem;
  layers: DesignLayer[];
  backLayers?: DesignLayer[];
  loadImage: ImageLoader;
  storage: ArtifactStorage;
}): Promise<ArtifactPaths> {
  const { orderId, item, loadImage, storage } = args;
  const front = { ...item, side: 'front' as const };
  const frontDesign = await renderDesignPng(front, args.layers, loadImage);
  const frontMockup = await renderMockupPng(front, frontDesign);
  const paths: ArtifactPaths = { mockupPath: `${orderId}/mockup.png`, designFilePath: `${orderId}/design.png` };
  await storage.upload(paths.designFilePath, frontDesign, 'image/png');
  await storage.upload(paths.mockupPath, frontMockup, 'image/png');

  if (args.backLayers?.length) {
    const back = { ...item, side: 'back' as const };
    const backDesign = await renderDesignPng(back, args.backLayers, loadImage);
    const backMockup = await renderMockupPng(back, backDesign);
    paths.backDesignFilePath = `${orderId}/back-design.png`;
    paths.backMockupPath = `${orderId}/back-mockup.png`;
    await storage.upload(paths.backDesignFilePath, backDesign, 'image/png');
    await storage.upload(paths.backMockupPath, backMockup, 'image/png');
  }
  return paths;
}
