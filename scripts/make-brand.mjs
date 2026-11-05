// Builds every picture of the VybeCrew logo from the one original (assets/brand/vybecrew-logo-source.jpg):
//   public/brand/vybecrew-logo.png        transparent logo for the site (header, footer, home page)
//   app/icon.png, app/apple-icon.png      browser tab / home screen icon (logo on black)
//   app/opengraph-image.png               the picture shown when a link to the site is shared
//   assets/brand/art-*.png                transparent art for the starter catalogue designs (see seed-brand-catalogue.mjs)
// The original has a black background, so the black is turned into transparency: black parts of the picture
// become "no ink", which is exactly right on a black garment. Run with: node scripts/make-brand.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SOURCE = 'assets/brand/vybecrew-logo-source.jpg';
const INSET = 10; // the original has a thin light edge from the screenshot; cut it off
const FLOOR = 14; // anything this dark (or darker) is background, and the JPEG's noise with it

/** Turns "light on black" into "light on transparent" without changing how it looks on black. */
async function keyOutBlack() {
  const meta = await sharp(SOURCE).metadata();
  const { data, info } = await sharp(SOURCE).extract({ left: INSET, top: INSET, width: meta.width - 2 * INSET, height: meta.height - 2 * INSET }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, o = 0; i < data.length; i += 3, o += 4) {
    const m = Math.max(data[i], data[i + 1], data[i + 2]);
    if (m <= FLOOR) continue; // stays fully transparent
    const alpha = Math.min(255, ((m - FLOOR) * 255) / (255 - FLOOR));
    // un-mix the colour from black so that colour x alpha on black gives back the original pixel
    out[o] = Math.min(255, (data[i] * 255) / m);
    out[o + 1] = Math.min(255, (data[i + 1] * 255) / m);
    out[o + 2] = Math.min(255, (data[i + 2] * 255) / m);
    out[o + 3] = alpha;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

const keyed = await keyOutBlack();
// 2x so there is enough detail for print and for sharp screens (it cannot add detail that is not in the original)
const srcMeta = await sharp(SOURCE).metadata();
const big = await keyed.clone().png().toBuffer().then((b) => sharp(b).resize({ width: (srcMeta.width - 2 * INSET) * 2, kernel: 'lanczos3' }).png().toBuffer());
const trimmed = await sharp(big).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 }).png().toBuffer();
const tm = await sharp(trimmed).metadata();
console.log('logo', tm.width, 'x', tm.height);

await mkdir('public/brand', { recursive: true });
await sharp(trimmed).resize({ width: 640, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile('public/brand/vybecrew-logo.png');

// logo on a black square, for icons and the share picture
async function square(size, fraction, file) {
  const logo = await sharp(trimmed).resize({ width: Math.round(size * fraction), height: Math.round(size * fraction), fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: '#000000' } }).composite([{ input: logo, gravity: 'center' }]).png().toFile(file);
}
await square(256, 0.92, 'app/icon.png');
await square(180, 0.92, 'app/apple-icon.png');
{
  const logo = await sharp(trimmed).resize({ height: 540, fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#000000' } }).composite([{ input: logo, gravity: 'center' }]).png().toFile('app/opengraph-image.png');
}

// ---- art for the catalogue ------------------------------------------------------------------------------------
// The catalogue centres a picture in the print area, as large as fits. For a smaller print (a chest logo) the logo is
// placed on a transparent canvas the same shape as the print area, so it lands where we want it.
const AREAS = { tee: { w: 28, h: 32 }, hoodie: { w: 25, h: 28 } };
const PX_PER_CM = 60;
await sharp(trimmed).resize({ width: 1600, kernel: 'lanczos3' }).png().toFile('assets/brand/art-full.png');
for (const [product, a] of Object.entries(AREAS)) {
  const W = Math.round(a.w * PX_PER_CM);
  const H = Math.round(a.h * PX_PER_CM);
  const logoW = Math.round(0.36 * W); // about 10 cm wide: a chest print
  const logo = await sharp(trimmed).resize({ width: logoW, kernel: 'lanczos3' }).png().toBuffer();
  const lm = await sharp(logo).metadata();
  // top right of the picture is the wearer's left chest when you look at the front of the garment
  const left = Math.round(0.58 * W);
  const top = Math.round(0.03 * H);
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logo, left: Math.min(left, W - lm.width), top }])
    .png()
    .toFile(`assets/brand/art-chest-${product}.png`);
}
console.log('done');
