import { z } from 'zod';
import { cartFingerprint, parseQuantity, type CartStore } from '@/lib/cart';
import type { DesignLayer } from '@/lib/designLayers';
import { layersHash, type Design, type DesignStore } from '@/lib/designs';
import { HttpError } from '@/lib/errors';
import type { PaymentProvider } from '@/lib/payments';
import { DEFAULT_PRICES, type PriceStore } from '@/lib/prices';
import { checkoutTotals, lineTotals } from '@/lib/pricing';

export { HttpError } from '@/lib/errors';

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

/** One design ordered in some quantity. A checkout with several designs makes one order for each. */
export type Order = {
  id: string;
  designId: string;
  userId: string;
  status: OrderStatus;
  /** How many pieces to print. Prices and costs below are for all of them. */
  quantity: number;
  costPkr: number;
  pricePkr: number;
  /** The delivery fee of the whole checkout sits on its first order; the others carry 0. */
  deliveryFeePkr: number;
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
  totalPkr: number;
  deliveryFeePkr: number;
  delivery: DeliveryDetails;
  items: { designId: string; quantity: number; pricePkr: number; costPkr: number }[];
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

/**
 * Charges the whole cart once, with amounts worked out here (never by the browser), and records one order for each
 * design. Everything is checked before anyone is charged, and the orders are created together or not at all.
 */
export async function placeCheckout(
  deps: { designs: DesignStore; orders: OrderStore; cart: CartStore; provider: PaymentProvider; prices?: PriceStore; artifacts?: ArtifactGenerator },
  args: { userId: string; delivery: unknown },
): Promise<{ orders: Order[]; created: boolean }> {
  const delivery = deliverySchema.parse(args.delivery);
  const prices = (await deps.prices?.get()) ?? DEFAULT_PRICES;
  const items = await deps.cart.list(args.userId);
  if (items.length === 0) throw new HttpError(400, 'Your cart is empty.');

  const lines: { design: Design; quantity: number; pricePkr: number; costPkr: number }[] = [];
  for (const item of items) {
    const design = await deps.designs.get(item.designId);
    if (!design || design.userId !== args.userId) throw new HttpError(404, 'Design not found.');
    // Approved AND the approval must be for exactly these layers (never pay for art that was not checked).
    if (design.status !== 'approved' || design.moderatedHash !== layersHash(design.layers, design.backLayers)) {
      throw new HttpError(403, 'This design has not been approved for payment.');
    }
    const quantity = parseQuantity(item.quantity);
    lines.push({ design, quantity, ...lineTotals(design, quantity, prices) });
  }

  const { deliveryFeePkr, totalPkr } = checkoutTotals(lines, prices);
  const reference = cartFingerprint(items);

  const settle = async (orders: Order[]) => {
    await deps.cart.clear(args.userId);
    return { orders, created: false };
  };

  // The same cart paid for twice never charges twice.
  const existing = await deps.orders.findCheckoutOrders(reference);
  if (existing) return settle(existing);

  const paid = await deps.provider.charge({ amountPkr: totalPkr, reference });
  if (!paid.ok) throw new HttpError(402, `Payment failed: ${paid.reason}`);

  let orders: Order[];
  try {
    orders = await deps.orders.createCheckout({
      userId: args.userId,
      reference,
      paymentRef: paid.paymentRef,
      totalPkr,
      deliveryFeePkr,
      delivery,
      items: lines.map((l) => ({ designId: l.design.id, quantity: l.quantity, pricePkr: l.pricePkr, costPkr: l.costPkr })),
    });
  } catch (e) {
    if (e instanceof DuplicateCheckoutError) {
      const winner = await deps.orders.findCheckoutOrders(reference); // a simultaneous request got there first
      if (winner) return settle(winner);
      throw new HttpError(409, 'One of these designs has already been ordered.');
    }
    throw e;
  }
  await deps.cart.clear(args.userId);

  // Only the request that created the orders generates files. A failure never undoes a payment: the order stays
  // paid and is flagged so an admin can regenerate its files.
  if (!deps.artifacts) return { orders, created: true };
  const designs = new Map(lines.map((l) => [l.design.id, l.design]));
  const finished: Order[] = [];
  for (const order of orders) {
    try {
      const paths = await deps.artifacts({ order, design: designs.get(order.designId)! });
      await deps.orders.setArtifacts(order.id, paths);
      finished.push({
        ...order,
        mockupPath: paths.mockupPath,
        designFilePath: paths.designFilePath,
        backMockupPath: paths.backMockupPath ?? null,
        backDesignFilePath: paths.backDesignFilePath ?? null,
        artifactsFailed: false,
      });
    } catch (e) {
      console.error('artifact generation failed for order', order.id, e);
      await deps.orders.markArtifactsFailed(order.id).catch(() => undefined);
      finished.push({ ...order, artifactsFailed: true });
    }
  }
  return { orders: finished, created: true };
}
