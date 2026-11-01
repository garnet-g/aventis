// Generates simple flat placeholder garment images (replace with real photos later).
import sharp from 'sharp';

const W = 800, H = 1000;
const shapes = {
  tee: `M300 120 Q400 190 500 120 L690 200 L750 380 L640 410 L620 360 L620 900 L180 900 L180 360 L160 410 L50 380 L110 200 Z`,
  hoodie: `M290 110 Q400 70 510 110 L700 200 L760 640 L650 660 L630 400 L630 920 L170 920 L170 400 L150 660 L40 640 L100 200 Z`,
};
const colors = { white: { fill: '#F4ECDD', stroke: '#16120F' }, black: { fill: '#1b1b1d', stroke: '#050505' } };

for (const [p, d] of Object.entries(shapes)) {
  for (const [c, { fill, stroke }] of Object.entries(colors)) {
    const hood = p === 'hoodie'
      ? `<path d="M300 112 Q400 40 500 112 Q400 175 300 112 Z" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`
      : `<path d="M300 120 Q400 200 500 120" fill="none" stroke="${stroke}" stroke-width="6"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#E9DDC6"/><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>${hood}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(`public/garments/${p}-${c}.png`);
  }
}
console.log('ok');
