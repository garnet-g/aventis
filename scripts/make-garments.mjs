// Builds the garment pictures the designer and the printer mockups draw on, into public/garments (800 x 1000):
//   tee-<colour>.jpg        the front, from the real photos in assets/garments/tee/<colour>.jpeg
//   tee-back-<colour>.png   the back, a flat drawing in that colour (placeholder until back photos exist)
//   hoodie-<white|black>.png, hoodie-back-<white|black>.png   flat drawings (placeholder until hoodie photos exist)
// Colours come from lib/garmentColors.json, the same list the app uses. Run with: node scripts/make-garments.mjs
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const W = 800, H = 1000;
const COLORS = JSON.parse(readFileSync('lib/garmentColors.json', 'utf8'));
const HOODIE_COLORS = ['white', 'black'];

// ---- T-shirt fronts: real photos ---------------------------------------------------------------------------------
for (const { id } of COLORS) {
  const src = `assets/garments/tee/${id}.jpeg`;
  if (!existsSync(src)) throw new Error(`missing photo ${src}`);
  // The photos are 1122 x 1402, the same 4:5 shape, so this is a plain resize (no cropping).
  await sharp(src).resize(W, H, { fit: 'cover' }).jpeg({ quality: 82, mozjpeg: true }).toFile(`public/garments/tee-${id}.jpg`);
}

// ---- Flat drawings ---------------------------------------------------------------------------------------------
const shapes = {
  tee: `M300 120 Q400 190 500 120 L690 200 L750 380 L640 410 L620 360 L620 900 L180 900 L180 360 L160 410 L50 380 L110 200 Z`,
  hoodie: `M290 110 Q400 70 510 110 L700 200 L760 640 L650 660 L630 400 L630 920 L170 920 L170 400 L150 660 L40 640 L100 200 Z`,
};
// From behind, the neckline sits higher and flatter.
const backShapes = {
  tee: `M300 120 Q400 140 500 120 L690 200 L750 380 L640 410 L620 360 L620 900 L180 900 L180 360 L160 410 L50 380 L110 200 Z`,
  hoodie: shapes.hoodie,
};

/** A darker shade of the fill for the outline (white keeps a black outline so it shows on the pale background). */
function strokeFor(hex) {
  if (hex.toLowerCase() === '#f2f1f6') return '#0a0a0a';
  const n = parseInt(hex.slice(1), 16);
  const dark = (v) => Math.round(v * 0.55).toString(16).padStart(2, '0');
  return `#${dark(n >> 16)}${dark((n >> 8) & 255)}${dark(n & 255)}`;
}

function collar(p, side, fill, stroke) {
  if (p === 'hoodie') {
    return side === 'front'
      ? `<path d="M300 112 Q400 40 500 112 Q400 175 300 112 Z" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`
      : `<path d="M295 112 Q400 40 505 112 L530 250 Q400 285 270 250 Z" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>`;
  }
  return side === 'front'
    ? `<path d="M300 120 Q400 200 500 120" fill="none" stroke="${stroke}" stroke-width="6"/>`
    : `<path d="M300 120 Q400 148 500 120" fill="none" stroke="${stroke}" stroke-width="6"/>`;
}

async function drawing(p, side, hex, file) {
  const fill = hex, stroke = strokeFor(hex);
  const d = (side === 'front' ? shapes : backShapes)[p];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#F0F0EC"/><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>${collar(p, side, fill, stroke)}</svg>`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(`public/garments/${file}`);
}

for (const { id, hex } of COLORS) await drawing('tee', 'back', hex, `tee-back-${id}.png`);
for (const id of HOODIE_COLORS) {
  const { hex } = COLORS.find((c) => c.id === id);
  await drawing('hoodie', 'front', hex, `hoodie-${id}.png`);
  await drawing('hoodie', 'back', hex, `hoodie-back-${id}.png`);
}
console.log('ok');
