import { z } from 'zod';
import type { DesignLayer } from '@/lib/designLayers';
import type { Design } from '@/lib/designs';
import { COUNTIES } from '@/lib/counties';

export { HttpError } from '@/lib/errors';
export { COUNTIES } from '@/lib/counties';

export type OrderStatus = 'paid' | 'at_printer' | 'shipped' | 'delivered';


export const deliverySchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(80),
  phone: z
    .string()
    // "254712345678" and "+254 712 345 678" are both stored as "+254712345678"
    .transform((s) => s.replace(/[\s\-()]/g, '').replace(/^254/, '+254'))
    .pipe(z.string().regex(/^(0[17]\d{8}|\+254[17]\d{8})$/, 'Enter a Kenyan mobile number like 0712345678.')),
  city: z.string().trim().min(2, 'Enter your city.').max(60),
  county: z.enum(COUNTIES, { message: 'Choose your county.' }),
  address: z.string().trim().min(5, 'Enter your full address.').max(200),
});
export type DeliveryDetails = z.output<typeof deliverySchema>;

/** One design ordered in some quantity. A checkout with several designs makes one order for each. */
export type Order = {
  id: string;
  designId: string;
  userId: string;
  status: OrderStatus;
  /** How many pieces to print. Prices and costs below are for all of them. */
  quantity: number;
  costKes: number;
  priceKes: number;
  /** The delivery fee of the whole checkout sits on its first order; the others carry 0. */
  deliveryFeeKes: number;
  delivery: DeliveryDetails;
  paymentRef: string;
  layersSnapshot: DesignLayer[];
  /** The back side as it was when paid (empty when the back is not printed). */
  backLayersSnapshot: DesignLayer[];
  mockupPath: string | null;
  designFilePath: string | null;
  backMockupPath: string | null;
  backDesignFilePath: string | null;
  artifactsFailed: boolean;
};

/** The files made for an order. The back pair exists only when the back is printed. */
export type ArtifactPaths = { mockupPath: string; designFilePath: string; backMockupPath?: string; backDesignFilePath?: string };

export type NewCheckout = {
  userId: string;
  /** Identifies this exact cart; a second checkout with the same reference is the same purchase. */
  reference: string;
  /** What the payment provider answered with. */
  paymentRef: string;
  totalKes: number;
  deliveryFeeKes: number;
  delivery: DeliveryDetails;
  items: { designId: string; quantity: number; priceKes: number; costKes: number }[];
};

export interface OrderStore {
  findByDesign(designId: string): Promise<Order | null>;
  findById(id: string): Promise<Order | null>;
  /** The orders made by the checkout with this reference, in cart order, or null when there is none. */
  findCheckoutOrders(reference: string): Promise<Order[] | null>;
  /** Compare-and-set: changes the status only if it is still `from`; returns null when someone else moved it first. */
  setStatus(id: string, from: OrderStatus, to: OrderStatus): Promise<Order | null>;
  /** Creates the checkout and all its orders together or not at all. Throws DuplicateCheckoutError on a repeat. */
  createCheckout(checkout: NewCheckout): Promise<Order[]>;
  setArtifacts(orderId: string, paths: ArtifactPaths): Promise<void>;
  markArtifactsFailed(orderId: string): Promise<void>;
}

/** Renders and stores the mockup and design file for a paid order, from the order's own snapshot. */
export type ArtifactGenerator = (args: { order: Order; design: Design }) => Promise<ArtifactPaths>;

export class DuplicateCheckoutError extends Error {
  constructor() {
    super('This checkout already exists, or one of its designs has already been ordered.');
  }
}

