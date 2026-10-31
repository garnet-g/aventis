export type ProductId = 'tee' | 'hoodie';
export type Color = 'white' | 'black';
export type Size = 'S' | 'M' | 'L' | 'XL';

export type PrintArea = { widthCm: number; heightCm: number; topOffsetCm: number };

export type Product = {
  label: string;
  costPkr: number;
  pricePkr: number;
  printArea: PrintArea;
  garmentImage: (c: Color) => string;
};

export const COLORS: Color[] = ['white', 'black'];
export const SIZES: Size[] = ['S', 'M', 'L', 'XL'];

// PLACEHOLDER: confirm with owner/printer
export const DELIVERY_FEE_PKR = 250;
// PLACEHOLDER: confirm with owner/printer
export const MIN_DPI = 150;

export const catalog: Record<ProductId, Product> = {
  tee: {
    label: 'T-shirt',
    costPkr: 800,
    pricePkr: 1500, // PLACEHOLDER: confirm with owner/printer
    printArea: { widthCm: 28, heightCm: 32, topOffsetCm: 8 }, // PLACEHOLDER: confirm with owner/printer
    garmentImage: (c) => `/garments/tee-${c}.png`,
  },
  hoodie: {
    label: 'Hoodie',
    costPkr: 1300,
    pricePkr: 2200, // PLACEHOLDER: confirm with owner/printer
    printArea: { widthCm: 25, heightCm: 28, topOffsetCm: 10 }, // PLACEHOLDER: confirm with owner/printer
    garmentImage: (c) => `/garments/hoodie-${c}.png`,
  },
};
