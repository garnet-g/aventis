import { cartFingerprint, parseQuantity, type CartStore } from '@/lib/cart';
import { layersHash, type Design, type DesignStore } from '@/lib/designs';
import { HttpError } from '@/lib/errors';
import { deliverySchema, DuplicateCheckoutError, type ArtifactGenerator, type DeliveryDetails, type Order, type OrderStore } from '@/lib/orders';
import { toMpesaPhone } from '@/lib/payments/mpesa';
import type { PaymentProvider } from '@/lib/payments';
import { DEFAULT_PRICES, type PriceStore } from '@/lib/prices';
import { checkoutTotals, lineTotals } from '@/lib/pricing';

/**
 * Paying for the cart, in three steps:
 *   1. startCheckout checks the cart, works out the amount on the server, records a pending payment with a copy of
 *      what is being bought, and asks the provider for the money.
 *   2. With M-Pesa the customer approves on their phone; Safaricom's callback (or a status check) arrives later.
 *   3. finalizePayment turns the paid payment into orders, together or not at all.
 * Test mode pays at once, so steps 1-3 happen in one request.
 */

export type CheckoutItem = { designId: string; quantity: number; priceKes: number; costKes: number };

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'needs_refund';

export type PaymentRecord = {
  id: string;
  userId: string;
  /** Identifies this exact cart: the same designs and quantities. */
  reference: string;
  amountKes: number;
  deliveryFeeKes: number;
  delivery: DeliveryDetails;
  items: CheckoutItem[];
  /** The M-Pesa number asked to pay, 2547XXXXXXXX. */
  phone: string;
  provider: string;
  /** The provider's id for the request (M-Pesa CheckoutRequestID), once it has one. */
  requestId: string | null;
  status: PaymentStatus;
  /** The provider's receipt (M-Pesa receipt number) once paid. */
  providerRef: string | null;
  failureReason: string | null;
  createdAt: string;
};

export interface PaymentStore {
  create(p: Pick<PaymentRecord, 'userId' | 'reference' | 'amountKes' | 'deliveryFeeKes' | 'delivery' | 'items' | 'phone' | 'provider'>): Promise<PaymentRecord>;
  get(id: string): Promise<PaymentRecord | null>;
  findByRequestId(requestId: string): Promise<PaymentRecord | null>;
  /** The customer's most recent payment that is still waiting for an answer. */
  latestPending(userId: string): Promise<PaymentRecord | null>;
  setRequestId(id: string, requestId: string): Promise<void>;
  /** Moves a payment from one of `from` to `to`; null when it was not in one of `from` (someone else settled it). */
  transition(id: string, from: PaymentStatus[], to: PaymentStatus, fields?: { providerRef?: string; failureReason?: string }): Promise<PaymentRecord | null>;
}

/** How long a phone prompt is worth waiting for before a new one may be sent (M-Pesa prompts time out after ~1 minute). */
export const PROMPT_WINDOW_MS = 90_000;
/** After this, a payment with no answer is treated as expired (it can still be completed if Safaricom confirms later). */
export const EXPIRE_AFTER_MS = 4 * 60_000;

type Deps = {
  designs: DesignStore;
  orders: OrderStore;
  cart: CartStore;
  provider: PaymentProvider;
  payments: PaymentStore;
  prices?: PriceStore;
  now?: () => number;
};

export type CheckoutResult =
  | { status: 'paid'; payment: PaymentRecord | null; orders: Order[]; created: boolean }
  | { status: 'pending'; payment: PaymentRecord; message: string };

/** Checks every line of the cart and works out what to charge. Nothing is written. */
async function prepareCheckout(deps: Pick<Deps, 'designs' | 'cart' | 'prices'>, userId: string, deliveryInput: unknown) {
  const delivery = deliverySchema.parse(deliveryInput);
  const prices = (await deps.prices?.get()) ?? DEFAULT_PRICES;
  const cartItems = await deps.cart.list(userId);
  if (cartItems.length === 0) throw new HttpError(400, 'Your cart is empty.');

  const lines: { design: Design; quantity: number }[] = [];
  for (const item of cartItems) {
    const design = await deps.designs.get(item.designId);
    if (!design || design.userId !== userId) throw new HttpError(404, 'Design not found.');
    // Approved AND the approval must be for exactly these layers (never pay for art that was not checked).
    if (design.status !== 'approved' || design.moderatedHash !== layersHash(design.layers, design.backLayers)) {
      throw new HttpError(403, 'This design has not been approved for payment.');
    }
    lines.push({ design, quantity: parseQuantity(item.quantity) });
  }
  // Bulk prices count every piece in the cart, so a team order in mixed sizes gets them too.
  const totalPieces = lines.reduce((n, l) => n + l.quantity, 0);
  const priced = lines.map((l) => ({ ...l, ...lineTotals(l.design, l.quantity, prices, totalPieces) }));
  const { deliveryFeeKes, totalKes } = checkoutTotals(priced, prices, delivery.county);
  const items: CheckoutItem[] = priced.map((l) => ({ designId: l.design.id, quantity: l.quantity, priceKes: l.priceKes, costKes: l.costKes }));
  return { delivery, items, deliveryFeeKes, totalKes, reference: cartFingerprint(cartItems) };
}

/** Removes exactly the paid designs from the cart (anything added while the phone prompt was open stays). */
async function clearPaid(cart: CartStore, userId: string, items: CheckoutItem[]) {
  for (const i of items) await cart.remove(userId, i.designId);
}

/** Step 1. Returns orders straight away for test mode, or a pending payment for M-Pesa. */
export async function startCheckout(deps: Deps, args: { userId: string; delivery: unknown; mpesaPhone?: string }): Promise<CheckoutResult> {
  const now = deps.now ?? Date.now;
  const prep = await prepareCheckout(deps, args.userId, args.delivery);
  const phone = toMpesaPhone(args.mpesaPhone?.trim() || prep.delivery.phone);
  if (!phone) throw new HttpError(400, 'Enter a Safaricom M-Pesa number like 0712345678.');

  // The same cart was already paid for: show those orders, never charge again.
  const existing = await deps.orders.findCheckoutOrders(prep.reference);
  if (existing) {
    await clearPaid(deps.cart, args.userId, prep.items);
    return { status: 'paid', payment: null, orders: existing, created: false };
  }

  // A prompt is already on its way: don't send a second one while the first can still be approved.
  const open = await deps.payments.latestPending(args.userId);
  if (open) {
    const settled = await refreshPayment(deps, open);
    if (settled.status === 'paid' && settled.payment?.reference === prep.reference) return settled as CheckoutResult;
    if (settled.status === 'pending' && now() - Date.parse(open.createdAt) < PROMPT_WINDOW_MS) {
      if (open.reference === prep.reference) return { status: 'pending', payment: open, message: 'Check your phone and enter your M-Pesa PIN.' };
      throw new HttpError(409, 'An M-Pesa request is still open on your phone. Finish or cancel it, then try again in a minute.');
    }
    if (settled.status === 'pending') await deps.payments.transition(open.id, ['pending'], 'expired', { failureReason: 'No answer from the phone.' });
  }

  const payment = await deps.payments.create({
    userId: args.userId,
    reference: prep.reference,
    amountKes: prep.totalKes,
    deliveryFeeKes: prep.deliveryFeeKes,
    delivery: prep.delivery,
    items: prep.items,
    phone,
    provider: deps.provider.name,
  });
  const started = await deps.provider.start({ amountKes: prep.totalKes, reference: prep.reference, phone, description: 'VybeCrew order' });
  if (started.status === 'failed') {
    await deps.payments.transition(payment.id, ['pending'], 'failed', { failureReason: started.reason });
    throw new HttpError(402, `Payment failed: ${started.reason}`);
  }
  if (started.status === 'paid') {
    const done = await finalizePayment(deps, payment.id, { providerRef: started.paymentRef });
    if (done.status === 'paid') return done;
    throw new HttpError(409, done.reason ?? 'One of these designs has changed or was already ordered.');
  }
  await deps.payments.setRequestId(payment.id, started.requestId);
  return { status: 'pending', payment: { ...payment, requestId: started.requestId }, message: started.message };
}

export type FinalizeResult =
  | { status: 'paid'; payment: PaymentRecord; orders: Order[]; created: boolean }
  | { status: 'failed' | 'needs_refund' | 'pending' | 'expired'; payment: PaymentRecord | null; reason?: string; /** True only for the call that moved it to needs_refund (so admins are alerted once). */ flagged?: boolean };

/**
 * Step 3: the money arrived. Records the orders from the payment's own copy of the cart. Safe to call twice (the
 * callback and a status check can race): only one call moves the payment to paid and creates orders.
 */
export async function finalizePayment(
  deps: Pick<Deps, 'orders' | 'cart' | 'payments'>,
  paymentId: string,
  args: { providerRef: string; amountKes?: number },
): Promise<FinalizeResult> {
  const p = await deps.payments.get(paymentId);
  if (!p) return { status: 'failed', payment: null, reason: 'Payment not found.' };
  if (args.amountKes !== undefined && Math.round(args.amountKes) !== p.amountKes) {
    const flagged = await deps.payments.transition(p.id, ['pending', 'expired'], 'needs_refund', {
      providerRef: args.providerRef,
      failureReason: `Paid KES ${args.amountKes}, expected KES ${p.amountKes}.`,
    });
    return { status: 'needs_refund', payment: flagged ?? p, reason: 'The amount paid does not match the order.', flagged: Boolean(flagged) };
  }
  // A late confirmation can still complete a payment we had given up waiting for ("expired").
  const paid = await deps.payments.transition(p.id, ['pending', 'expired'], 'paid', { providerRef: args.providerRef });
  if (!paid) {
    const current = (await deps.payments.get(p.id))!;
    if (current.status !== 'paid') return { status: current.status, payment: current, reason: current.failureReason ?? undefined };
    const orders = (await deps.orders.findCheckoutOrders(current.reference)) ?? [];
    return { status: 'paid', payment: current, orders, created: false };
  }

  try {
    const orders = await deps.orders.createCheckout({
      userId: p.userId,
      reference: p.reference,
      paymentRef: args.providerRef,
      totalKes: p.amountKes,
      deliveryFeeKes: p.deliveryFeeKes,
      delivery: p.delivery,
      items: p.items,
    });
    await clearPaid(deps.cart, p.userId, p.items);
    return { status: 'paid', payment: paid, orders, created: true };
  } catch (e) {
    if (e instanceof DuplicateCheckoutError) {
      const winner = await deps.orders.findCheckoutOrders(p.reference);
      if (winner) return { status: 'paid', payment: paid, orders: winner, created: false };
    }
    // Paid, but a design changed or was ordered meanwhile: the money must go back. An admin is alerted.
    console.error('paid checkout could not become orders', p.id, e);
    const flagged = await deps.payments.transition(p.id, ['paid'], 'needs_refund', { failureReason: 'A design changed or was already ordered after payment started.' });
    return { status: 'needs_refund', payment: flagged ?? paid, reason: 'One of these designs changed while you were paying. We will refund you.', flagged: Boolean(flagged) };
  }
}

/** Asks the provider about a pending payment and acts on the answer. */
export async function refreshPayment(deps: Pick<Deps, 'orders' | 'cart' | 'payments' | 'provider' | 'now'>, p: PaymentRecord): Promise<FinalizeResult | CheckoutResult> {
  const now = deps.now ?? Date.now;
  if (p.status !== 'pending' && p.status !== 'expired') return { status: p.status, payment: p, reason: p.failureReason ?? undefined } as FinalizeResult;
  if (!p.requestId) return { status: 'pending', payment: p, reason: undefined } as FinalizeResult;
  const answer = await deps.provider.check(p.requestId);
  if (answer.status === 'paid') return finalizePayment(deps, p.id, { providerRef: p.providerRef ?? `MPESA-${p.requestId}` });
  if (answer.status === 'failed') {
    const failed = await deps.payments.transition(p.id, ['pending', 'expired'], 'failed', { failureReason: answer.reason });
    return { status: 'failed', payment: failed ?? p, reason: answer.reason };
  }
  if (p.status === 'pending' && now() - Date.parse(p.createdAt) > EXPIRE_AFTER_MS) {
    const expired = await deps.payments.transition(p.id, ['pending'], 'expired', { failureReason: 'No answer from the phone.' });
    return { status: 'expired', payment: expired ?? p, reason: 'No answer from the phone.' };
  }
  return { status: 'pending', payment: p } as FinalizeResult;
}

/** What the waiting page asks every few seconds. Checks with the provider when the callback is taking a while. */
export async function paymentStatus(deps: Pick<Deps, 'orders' | 'cart' | 'payments' | 'provider' | 'now'>, paymentId: string, userId: string) {
  const now = deps.now ?? Date.now;
  const p = await deps.payments.get(paymentId);
  if (!p || p.userId !== userId) throw new HttpError(404, 'Payment not found.');
  let result: { status: PaymentStatus; reason?: string; orders?: Order[]; created?: boolean; flagged?: boolean } = { status: p.status, reason: p.failureReason ?? undefined };
  if ((p.status === 'pending' || p.status === 'expired') && now() - Date.parse(p.createdAt) > 15_000) {
    const r = await refreshPayment(deps, p);
    result = { status: r.status as PaymentStatus, reason: 'reason' in r ? r.reason : undefined, orders: 'orders' in r ? r.orders : undefined, created: 'created' in r ? r.created : undefined, flagged: 'flagged' in r ? r.flagged : undefined };
  }
  const orders = result.orders ?? (result.status === 'paid' ? (await deps.orders.findCheckoutOrders(p.reference)) ?? [] : []);
  return { status: result.status, reason: result.reason, orderIds: orders.map((o) => o.id), orders, created: result.created ?? false, flagged: result.flagged ?? false };
}

/** Draws the printer's files for new orders. A failure never undoes a payment: the order is flagged for "Regenerate". */
export async function generateOrderFiles(deps: { designs: DesignStore; orders: OrderStore; artifacts: ArtifactGenerator }, orders: Order[]): Promise<Order[]> {
  const finished: Order[] = [];
  for (const order of orders) {
    try {
      const design = await deps.designs.get(order.designId);
      if (!design) throw new Error('design not found');
      const paths = await deps.artifacts({ order, design });
      await deps.orders.setArtifacts(order.id, paths);
      finished.push({ ...order, mockupPath: paths.mockupPath, designFilePath: paths.designFilePath, backMockupPath: paths.backMockupPath ?? null, backDesignFilePath: paths.backDesignFilePath ?? null, artifactsFailed: false });
    } catch (e) {
      console.error('artifact generation failed for order', order.id, e);
      await deps.orders.markArtifactsFailed(order.id).catch(() => undefined);
      finished.push({ ...order, artifactsFailed: true });
    }
  }
  return finished;
}

/**
 * One-step checkout for providers that answer at once (test mode). Kept for callers and tests that don't need the
 * waiting step; with M-Pesa use startCheckout and let the callback finish the payment.
 */
export async function placeCheckout(
  deps: Omit<Deps, 'payments'> & { payments?: PaymentStore; artifacts?: ArtifactGenerator },
  args: { userId: string; delivery: unknown; mpesaPhone?: string },
): Promise<{ orders: Order[]; created: boolean }> {
  const payments = deps.payments ?? new MemoryPaymentStore();
  const result = await startCheckout({ ...deps, payments }, args);
  if (result.status !== 'paid') throw new HttpError(402, 'The payment has not gone through yet.');
  if (!result.created || !deps.artifacts) return { orders: result.orders, created: result.created };
  return { orders: await generateOrderFiles({ designs: deps.designs, orders: deps.orders, artifacts: deps.artifacts }, result.orders), created: true };
}

/** In-memory payments (tests, and test-mode checkouts with nothing to wait for). */
export class MemoryPaymentStore implements PaymentStore {
  rows = new Map<string, PaymentRecord>();
  async create(p: Parameters<PaymentStore['create']>[0]) {
    const row: PaymentRecord = { ...p, id: crypto.randomUUID(), requestId: null, status: 'pending', providerRef: null, failureReason: null, createdAt: new Date().toISOString() };
    this.rows.set(row.id, row);
    return row;
  }
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByRequestId(requestId: string) {
    return [...this.rows.values()].find((r) => r.requestId === requestId) ?? null;
  }
  async latestPending(userId: string) {
    return [...this.rows.values()].filter((r) => r.userId === userId && r.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }
  async setRequestId(id: string, requestId: string) {
    const r = this.rows.get(id);
    if (r) r.requestId = requestId;
  }
  async transition(id: string, from: PaymentStatus[], to: PaymentStatus, fields: { providerRef?: string; failureReason?: string } = {}) {
    const r = this.rows.get(id);
    if (!r || !from.includes(r.status)) return null;
    Object.assign(r, { status: to, ...(fields.providerRef && { providerRef: fields.providerRef }), ...(fields.failureReason && { failureReason: fields.failureReason }) });
    return { ...r };
  }
}
