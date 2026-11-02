export type ProductId = 'tee' | 'hoodie';
export type Color = 'white' | 'black';
export type Size = 'S' | 'M' | 'L' | 'XL';

export type Side = 'front' | 'back';

export type PrintArea = { widthCm: number; heightCm: number; topOffsetCm: number };

export type Product = {
  label: string;
  costPkr: number;
  pricePkr: number;
  /** Front print area. The back has its own: see `backPrintArea` and `printAreaFor`. */
  printArea: PrintArea;
  backPrintArea: PrintArea;
  garmentImage: (c: Color, side?: Side) => string;
};

export const COLORS: Color[] = ['white', 'black'];
export const SIZES: Size[] = ['S', 'M', 'L', 'XL'];

// PLACEHOLDER: confirm with owner/printer
export const DELIVERY_FEE_PKR = 250;
// PLACEHOLDER: confirm with owner/printer
export const MIN_DPI = 150;
// PLACEHOLDER: what the customer pays extra, and what the printer charges extra, when the back is printed too.
export const BACK_PRINT_PRICE_PKR = 500;
export const BACK_PRINT_COST_PKR = 400;

export const catalog: Record<ProductId, Product> = {
  tee: {
    label: 'T-shirt',
    costPkr: 800,
    pricePkr: 1500, // PLACEHOLDER: confirm with owner/printer
    printArea: { widthCm: 28, heightCm: 32, topOffsetCm: 8 }, // PLACEHOLDER: confirm with owner/printer
    backPrintArea: { widthCm: 28, heightCm: 32, topOffsetCm: 6 }, // PLACEHOLDER: confirm with owner/printer
    garmentImage: (c, side = 'front') => (side === 'back' ? `/garments/tee-back-${c}.png` : `/garments/tee-${c}.png`),
  },
  hoodie: {
    label: 'Hoodie',
    costPkr: 1300,
    pricePkr: 2200, // PLACEHOLDER: confirm with owner/printer
    printArea: { widthCm: 25, heightCm: 28, topOffsetCm: 10 }, // PLACEHOLDER: confirm with owner/printer
    backPrintArea: { widthCm: 25, heightCm: 28, topOffsetCm: 8 }, // PLACEHOLDER: confirm with owner/printer
    garmentImage: (c, side = 'front') => (side === 'back' ? `/garments/hoodie-back-${c}.png` : `/garments/hoodie-${c}.png`),
  },
};

export function printAreaFor(product: ProductId, side: Side = 'front'): PrintArea {
  return side === 'back' ? catalog[product].backPrintArea : catalog[product].printArea;
}
