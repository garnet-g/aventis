import garmentColors from '@/lib/garmentColors.json';

export type ProductId = 'tee' | 'hoodie';
/** Garment colours. The names, labels and swatches live in lib/garmentColors.json (also read by the picture script). */
export type Color = 'black' | 'white' | 'grey' | 'navy' | 'blue' | 'green' | 'maroon' | 'red' | 'orange' | 'yellow';
export type Size = 'S' | 'M' | 'L' | 'XL';

export type Side = 'front' | 'back';

export type PrintArea = { widthCm: number; heightCm: number; topOffsetCm: number };

export type Product = {
  label: string;
  costKes: number;
  priceKes: number;
  /** The colours this item is sold in, in the order they are offered. */
  colors: Color[];
  /** Front print area. The back has its own: see `backPrintArea` and `printAreaFor`. */
  printArea: PrintArea;
  backPrintArea: PrintArea;
  garmentImage: (c: Color, side?: Side) => string;
};

type ColorInfo = { id: Color; label: string; hex: string };
const COLOR_INFO = garmentColors as ColorInfo[];

/** Every garment colour, in the order they are offered. */
export const COLORS: Color[] = COLOR_INFO.map((c) => c.id);
export const SIZES: Size[] = ['S', 'M', 'L', 'XL'];

const info = (c: Color) => COLOR_INFO.find((x) => x.id === c) ?? COLOR_INFO[0];
/** "Navy blue": the name customers see. */
export const colorLabel = (c: Color) => info(c).label;
/** The swatch colour, sampled from the garment photo. */
export const colorHex = (c: Color) => info(c).hex;
/** True for colours where dark ink reads better than white (white, grey, yellow, orange). */
export const isLightColor = (c: Color) => {
  const n = parseInt(colorHex(c).slice(1), 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.4;
};

// PLACEHOLDER: confirm with owner/printer
export const DELIVERY_FEE_KES = 250;
// PLACEHOLDER: delivery to counties outside the Nairobi area
export const DELIVERY_FEE_UPCOUNTRY_KES = 400;
// PLACEHOLDER: confirm with owner/printer
export const MIN_DPI = 150;
// PLACEHOLDER: what the customer pays extra, and what the printer charges extra, when the back is printed too.
export const BACK_PRINT_PRICE_KES = 500;
export const BACK_PRINT_COST_KES = 400;

export const catalog: Record<ProductId, Product> = {
  tee: {
    label: 'T-shirt',
    costKes: 800,
    priceKes: 1500, // PLACEHOLDER: confirm with owner/printer
    colors: COLORS,
    // Front: 27 cm wide x 32 cm tall, as set by the owner. Its top sits 8 cm below the collar seam (placement placeholder).
    printArea: { widthCm: 27, heightCm: 32, topOffsetCm: 8 },
    backPrintArea: { widthCm: 28, heightCm: 32, topOffsetCm: 6 }, // PLACEHOLDER: confirm with owner/printer
    garmentImage: (c, side = 'front') => (side === 'back' ? `/garments/tee-back-${c}.jpg` : `/garments/tee-${c}.jpg`),
  },
  hoodie: {
    label: 'Hoodie',
    costKes: 1300,
    priceKes: 2200, // PLACEHOLDER: confirm with owner/printer
    // Every colour except orange, which has no hoodie photo.
    colors: COLORS.filter((c) => c !== 'orange'),
    // 25 cm wide x 28 cm tall on the front and on the back, as set by the owner.
    printArea: { widthCm: 25, heightCm: 28, topOffsetCm: 10 },
    // On the back this is measured from the bottom of the hood, not the collar, so the print never lands on the hood.
    backPrintArea: { widthCm: 25, heightCm: 28, topOffsetCm: 2 },
    garmentImage: (c, side = 'front') => (side === 'back' ? `/garments/hoodie-back-${c}.jpg` : `/garments/hoodie-${c}.jpg`),
  },
};

export const offersColor = (product: ProductId, c: Color) => catalog[product].colors.includes(c);

/** The colour to switch to when the item changes and doesn't come in the current one: the closest of light or dark. */
export function fallbackColor(product: ProductId, c: Color): Color {
  if (offersColor(product, c)) return c;
  const options = catalog[product].colors;
  return options.find((o) => isLightColor(o) === isLightColor(c)) ?? options[0];
}

export function printAreaFor(product: ProductId, side: Side = 'front'): PrintArea {
  return side === 'back' ? catalog[product].backPrintArea : catalog[product].printArea;
}

// PLACEHOLDER: how long printing and delivery usually take, shown to customers after they pay.
export const TURNAROUND = { printing: '2 to 4 working days', nairobi: '1 to 2 days', upcountry: '2 to 5 days' } as const;
