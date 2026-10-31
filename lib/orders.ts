import { z } from 'zod';
import { catalog, DELIVERY_FEE_PKR } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { layersHash, type Design, type DesignStore } from '@/lib/designs';
import type { PaymentProvider } from '@/lib/payments';

export type OrderStatus = 'paid' | 'at_printer' | 'shipped' | 'delivered';

export const PROVINCES = [
  'Punjab',
  'Sindh',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Islamabad Capital Territory',
  'Gilgit-Baltistan',
  'Azad Jammu and Kashmir',
] as const;

export const deliverySchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(80),
  phone: z
    .string()
    .transform((s) => s.replace(/[\s\-()]/g, ''))
    .pipe(z.string().regex(/^(03\d{9}|\+923\d{9})$/, 'Enter a Pakistani mobile number like 03001234567.')),
  city: z.string().trim().min(2, 'Enter your city.').max(60),
  province: z.enum(PROVINCES, { message: 'Choose your province.' }),
  address: z.string().trim().min(5, 'Enter your full address.').max(200),
});
export type DeliveryDetails = z.output<typeof deliverySchema>;

export type Order = {
  id: string;
  designId: string;
  userId: string;
  status: OrderStatus;
  costPkr: number;
  pricePkr: number;
  deliveryFeePkr: number;
  delivery: DeliveryDetails;
  paymentRef: string;
  layersSnapshot: DesignLayer[];
  mockupPath: string | null;
  designFilePath: string | null;
  artifactsFailed: boolean;
};

export type NewOrder = Pick<
  Order,
  'designId' | 'userId' | 'costPkr' | 'pricePkr' | 'deliveryFeePkr' | 'delivery' | 'paymentRef' | 'layersSnapshot'
>;

export interface OrderStore {
  findByDesign(designId: string): Promise<Order | null>;
  /** Must throw DuplicateOrderError when the design already has an order (unique design_id / payment_ref). */
  insert(order: NewOrder): Promise<Order>;
  setArtifacts(orderId: string, paths: { mockupPath: string; designFilePath: string }): Promise<void>;
  markArtifactsFailed(orderId: string): Promise<void>;
}

/** Renders and stores the mockup and design file for a paid order, from the order's own snapshot. */
export type ArtifactGenerator = (args: { order: Order; design: Design }) => Promise<{ mockupPath: string; designFilePath: string }>;

export class DuplicateOrderError extends Error {
  constructor() {
    super('This design already has an order.');
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Charges the server-computed amount for an approved design and records exactly one paid order. */
export async function createPaidOrder(
  deps: { designs: DesignStore; orders: OrderStore; provider: PaymentProvider; artifacts?: ArtifactGenerator },
  args: { designId: string; userId: string; delivery: unknown },
): Promise<Order> {
  const delivery = deliverySchema.parse(args.delivery);

  const design = await deps.designs.get(args.designId);
  if (!design || design.userId !== args.userId) throw new HttpError(404, 'Design not found.');

  const existing = await deps.orders.findByDesign(design.id);
  if (existing) return existing; // paying twice never charges twice
  // Approved AND the approval must be for exactly these layers (never pay for art that was not checked).
  if (design.status !== 'approved' || design.moderatedHash !== layersHash(design.layers)) {
    throw new HttpError(403, 'This design has not been approved for payment.');
  }

  const product = catalog[design.product];
  const paid = await deps.provider.charge({ amountPkr: product.pricePkr + DELIVERY_FEE_PKR, reference: design.id });
  if (!paid.ok) throw new HttpError(402, `Payment failed: ${paid.reason}`);

  let order: Order;
  try {
    order = await deps.orders.insert({
      designId: design.id,
      userId: design.userId,
      costPkr: product.costPkr,
      pricePkr: product.pricePkr,
      deliveryFeePkr: DELIVERY_FEE_PKR,
      delivery,
      paymentRef: paid.paymentRef,
      layersSnapshot: design.layers, // artifacts are always rendered from this copy, never from the editable design
    });
  } catch (e) {
    if (e instanceof DuplicateOrderError) {
      const winner = await deps.orders.findByDesign(design.id); // a simultaneous request got there first
      if (winner) return winner;
    }
    throw e;
  }

  // Only the request that created the order generates files. A failure never undoes a payment: the order
  // stays paid and is flagged so an admin can regenerate the files.
  if (!deps.artifacts) return order;
  try {
    const paths = await deps.artifacts({ order, design });
    await deps.orders.setArtifacts(order.id, paths);
    return { ...order, ...paths, artifactsFailed: false };
  } catch (e) {
    console.error('artifact generation failed for order', order.id, e);
    await deps.orders.markArtifactsFailed(order.id).catch(() => undefined);
    return { ...order, artifactsFailed: true };
  }
}
