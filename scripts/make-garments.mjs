// Generates simple flat placeholder garment images, front and back (replace with real photos later).
import sharp from 'sharp';

const W = 800, H = 1000;
const shapes = {
  tee: `M300 120 Q400 190 500 120 L690 200 L750 380 L640 410 L620 360 L620 900 L180 900 L180 360 L160 410 L50 380 L110 200 Z`,
  hoodie: `M290 110 Q400 70 510 110 L700 200 L760 640 L650 660 L630 400 L630 920 L170 920 L170 400 L150 660 L40 640 L100 200 Z`,
};
// From behind, the neckline sits higher and flatter.
const backShapes = {
  tee: `M300 120 Q400 140 500 120 L690 200 L750 380 L640 410 L620 360 L620 900 L180 900 L180 360 L160 410 L50 380 L110 200 Z`,
  hoodie: shapes.hoodie,
};
const colors = { white: { fill: '#F4ECDD', stroke: '#16120F' }, black: { fill: '#1b1b1d', stroke: '#050505' } };

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

for (const side of ['front', 'back']) {
  for (const p of Object.keys(shapes)) {
    const d = (side === 'front' ? shapes : backShapes)[p];
    for (const [c, { fill, stroke }] of Object.entries(colors)) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#E9DDC6"/><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>${collar(p, side, fill, stroke)}</svg>`;
      const name = side === 'front' ? `${p}-${c}.png` : `${p}-back-${c}.png`;
      await sharp(Buffer.from(svg)).png().toFile(`public/garments/${name}`);
    }
  }
}
console.log('ok');
