import { createHash } from 'node:crypto';
import { HttpError } from '@/lib/errors';
import { layersHash, type Design, type DesignStore } from '@/lib/designs';
import { checkoutTotals, lineTotals, MAX_QUANTITY, unitPricePkr } from '@/lib/pricing';

export type CartItem = { designId: string; quantity: number };

export interface CartStore {
  list(userId: string): Promise<CartItem[]>;
  /** Puts a design in the cart; if it is already there its quantity is left alone. */
  add(userId: string, designId: string, quantity: number): Promise<void>;
  /** Returns false when the design is not in the cart. */
  setQuantity(userId: string, designId: string, quantity: number): Promise<boolean>;
  remove(userId: string, designId: string): Promise<void>;
  clear(userId: string): Promise<void>;
}

/** A quantity is a whole number from 1 to 50. */
export function parseQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_QUANTITY) {
    throw new HttpError(400, `Quantity must be a whole number from 1 to ${MAX_QUANTITY}.`);
  }
  return value;
}

const isApproved = (d: Design) => d.status === 'approved' && d.moderatedHash === layersHash(d.layers, d.backLayers);

export async function addToCart(deps: { designs: DesignStore; cart: CartStore }, userId: string, designId: string, quantity = 1) {
  const q = parseQuantity(quantity);
  const design = await deps.designs.get(designId);
  if (!design || design.userId !== userId) throw new HttpError(404, 'Design not found.');
  if (await deps.designs.hasOrder(design.id)) throw new HttpError(409, 'This design has already been ordered.');
  if (!isApproved(design)) throw new HttpError(403, 'This design has not been approved for payment.');
  await deps.cart.add(userId, design.id, q);
}

export async function setCartQuantity(deps: { cart: CartStore }, userId: string, designId: string, quantity: number) {
  const q = parseQuantity(quantity);
  if (!(await deps.cart.setQuantity(userId, designId, q))) throw new HttpError(404, 'That item is not in your cart.');
}

export async function removeFromCart(deps: { cart: CartStore }, userId: string, designId: string) {
  await deps.cart.remove(userId, designId);
}

export type CartLineView = {
  designId: string;
  design: Design;
  quantity: number;
  unitPricePkr: number;
  pricePkr: number;
  costPkr: number;
  /** False when this line cannot be paid for yet, with the reason in `problem`. */
  ok: boolean;
  problem?: string;
};

/** The cart as the customer sees it: every line priced, flagged if it cannot be paid for, with the totals. */
export async function loadCart(deps: { designs: DesignStore; cart: CartStore }, userId: string) {
  const lines: CartLineView[] = [];
  for (const item of await deps.cart.list(userId)) {
    const design = await deps.designs.get(item.designId);
    if (!design || design.userId !== userId) continue; // never show (or trust) something that is not the customer's
    const ordered = await deps.designs.hasOrder(design.id);
    const problem = ordered
      ? 'Already ordered.'
      : design.status === 'pending_review'
        ? 'Waiting for review.'
        : isApproved(design)
          ? undefined
          : 'Needs to be checked again before you can pay.';
    lines.push({
      designId: design.id,
      design,
      quantity: item.quantity,
      unitPricePkr: unitPricePkr(design),
      ...lineTotals(design, item.quantity),
      ok: !problem,
      problem,
    });
  }
  return { lines, ...checkoutTotals(lines), canCheckout: lines.length > 0 && lines.every((l) => l.ok) };
}

/** A stable key for "this exact cart": the same designs and quantities always give the same key. */
export function cartFingerprint(items: CartItem[]): string {
  const canonical = [...items]
    .sort((a, b) => a.designId.localeCompare(b.designId))
    .map((i) => `${i.designId}:${i.quantity}`)
    .join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}
