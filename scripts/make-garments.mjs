// Builds the garment pictures the designer and the mockups draw on, into public/garments (800 x 1000 JPEG):
//   <tee|hoodie>-<colour>.jpg        the front
//   <tee|hoodie>-back-<colour>.jpg   the back
// from the photos in assets/garments/<tee|hoodie>/<colour>.webp. Each photo is 1448 x 1086 with the front on the left
// half and the back on the right half. A half (724 x 1086) is padded at the sides to the app's 4:5 frame (869 x 1086,
// repeating the plain background) and resized to 800 x 1000, so nothing is cropped off.
// Colours come from lib/garmentColors.json. Run with: node scripts/make-garments.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const W = 800, H = 1000;
const HALF = 724, SRC_H = 1086;
const FRAME_W = Math.round((SRC_H * 4) / 5); // 869: the 4:5 frame at the photo's height
const PAD_LEFT = Math.floor((FRAME_W - HALF) / 2);
const PAD_RIGHT = FRAME_W - HALF - PAD_LEFT;
const COLORS = JSON.parse(readFileSync('lib/garmentColors.json', 'utf8')).map((c) => c.id);

/** The average colour of small patches in the two top corners of a half photo. */
async function backdrop(half) {
  const patch = async (left) => (await sharp(half).extract({ left, top: 0, width: 40, height: 60 }).resize(1, 1).removeAlpha().raw().toBuffer());
  const [l, r] = [await patch(0), await patch(HALF - 40)];
  return { r: Math.round((l[0] + r[0]) / 2), g: Math.round((l[1] + r[1]) / 2), b: Math.round((l[2] + r[2]) / 2), alpha: 1 };
}

for (const product of ['tee', 'hoodie']) {
  const dir = `assets/garments/${product}`;
  for (const file of readdirSync(dir)) {
    const id = file.replace(/\.webp$/, '');
    if (!COLORS.includes(id)) throw new Error(`${dir}/${file}: not a colour in lib/garmentColors.json`);
  }
  for (const id of COLORS) {
    const src = `${dir}/${id}.webp`;
    if (!existsSync(src)) continue; // this item isn't sold in this colour
    const meta = await sharp(src).metadata();
    if (meta.width !== HALF * 2 || meta.height !== SRC_H) throw new Error(`${src}: expected ${HALF * 2} x ${SRC_H}`);
    for (const [side, left] of [['front', 0], ['back', HALF]]) {
      const half = await sharp(src).extract({ left, top: 0, width: HALF, height: SRC_H }).toBuffer();
      const name = side === 'front' ? `${product}-${id}.jpg` : `${product}-back-${id}.jpg`;
      // Pad with the plain backdrop colour (sampled from the top corners, which are always backdrop). Repeating the
      // edge pixels instead would smear an arm that touches the edge. Two steps: sharp always resizes before it extends
      // within one pipeline, whatever the call order.
      const background = await backdrop(half);
      const framed = await sharp(half).extend({ left: PAD_LEFT, right: PAD_RIGHT, background }).toBuffer();
      await sharp(framed)
        .resize(W, H)
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(`public/garments/${name}`);
    }
  }
}
console.log('ok');
