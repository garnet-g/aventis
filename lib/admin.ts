import { layersHash, type Design, type DesignStore } from '@/lib/designs';
import { notifyDecision, notifyOrderStatus, type EmailSender } from '@/lib/notify';
import { HttpError, type ArtifactGenerator, type Order, type OrderStatus, type OrderStore } from '@/lib/orders';

const FLOW: OrderStatus[] = ['paid', 'at_printer', 'shipped', 'delivered'];
const DEFAULT_REJECT_REASON = 'This design cannot be printed.';
const SIGNED_URL_SECONDS = 60;

export const nextStatus = (current: OrderStatus): OrderStatus | null => FLOW[FLOW.indexOf(current) + 1] ?? null;

export const orderProfit = (o: Pick<Order, 'pricePkr' | 'deliveryFeePkr' | 'costPkr'>) =>
  o.pricePkr + o.deliveryFeePkr - o.costPkr;

/** Approve or reject a design that is waiting for review. Approval is only valid for the layers that were checked. */
export async function decideDesign(
  deps: { designs: DesignStore },
  id: string,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<Design> {
  const d = await deps.designs.get(id);
  if (!d) throw new HttpError(404, 'Design not found.');
  if (d.status !== 'pending_review') throw new HttpError(409, 'This design is not waiting for review.');

  let patch: Parameters<DesignStore['update']>[1];
  if (decision === 'approve') {
    if (d.moderatedHash !== layersHash(d.layers)) {
      throw new HttpError(409, 'The design changed after it was checked. Ask the customer to submit it again.');
    }
    patch = { status: 'approved', rejectReason: null };
  } else {
    patch = { status: 'rejected', rejectReason: reason?.trim().slice(0, 300) || DEFAULT_REJECT_REASON };
  }

  // Only apply the decision to the exact design the admin looked at.
  const updated = await deps.designs.updateIfVersion(id, d.version, patch);
  if (!updated) throw new HttpError(409, 'The design changed while you were reviewing it. Please reload.');
  return updated;
}

/** Moves an order exactly one step forward; two admins clicking at once can never skip a step. */
export async function advanceOrder(orders: OrderStore, id: string): Promise<Order> {
  const order = await orders.findById(id);
  if (!order) throw new HttpError(404, 'Order not found.');
  const next = nextStatus(order.status);
  if (!next) throw new HttpError(409, 'This order is already delivered.');
  const updated = await orders.setStatus(id, order.status, next);
  if (!updated) throw new HttpError(409, 'Someone else just changed this order. Reload and try again.');
  return updated;
}

/** Moves an order one step, then tells the customer when it ships or is delivered. A failed email never undoes the step. */
export async function advanceAndNotify(
  deps: { orders: OrderStore; email: EmailSender; emailFor: (userId: string) => Promise<string | null>; siteUrl: string },
  id: string,
): Promise<Order> {
  const order = await advanceOrder(deps.orders, id);
  try {
    const to = await deps.emailFor(order.userId);
    if (to) await notifyOrderStatus(deps.email, deps.siteUrl, { to, status: order.status, orderId: order.id });
  } catch (e) {
    console.error('could not email the customer about order', order.id, e);
  }
  return order;
}

/** Re-renders the mockup and design file from the order's snapshot (used when generation failed at payment). */
export async function regenerateArtifacts(
  deps: { orders: OrderStore; designs: DesignStore; artifacts: ArtifactGenerator },
  orderId: string,
): Promise<Order> {
  const order = await deps.orders.findById(orderId);
  if (!order) throw new HttpError(404, 'Order not found.');
  const design = await deps.designs.get(order.designId);
  if (!design) throw new HttpError(404, 'Design not found.');
  try {
    const paths = await deps.artifacts({ order, design });
    await deps.orders.setArtifacts(order.id, paths);
    return {
      ...order,
      mockupPath: paths.mockupPath,
      designFilePath: paths.designFilePath,
      backMockupPath: paths.backMockupPath ?? null,
      backDesignFilePath: paths.backDesignFilePath ?? null,
      artifactsFailed: false,
    };
  } catch (e) {
    await deps.orders.markArtifactsFailed(order.id).catch(() => undefined);
    throw e;
  }
}

export type ArtifactFile = 'mockup' | 'design' | 'back-mockup' | 'back-design';

/** The stored path for one of an order's files, or null when it does not exist (or is not a known file). */
export function artifactPath(
  order: Pick<Order, 'mockupPath' | 'designFilePath' | 'backMockupPath' | 'backDesignFilePath'>,
  file: ArtifactFile,
): string | null {
  switch (file) {
    case 'mockup':
      return order.mockupPath;
    case 'design':
      return order.designFilePath;
    case 'back-mockup':
      return order.backMockupPath;
    case 'back-design':
      return order.backDesignFilePath;
    default:
      return null;
  }
}

export async function signedDownloadUrl(
  storage: { createSignedUrl(path: string, expiresInSeconds: number): Promise<string> },
  path: string,
): Promise<string> {
  return storage.createSignedUrl(path, SIGNED_URL_SECONDS);
}

/** Decides, then emails the customer. A failed email is logged and never undoes the decision. */
export async function decideAndNotify(
  deps: { designs: DesignStore; email: EmailSender; emailFor: (userId: string) => Promise<string | null>; siteUrl: string },
  id: string,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<Design> {
  const design = await decideDesign({ designs: deps.designs }, id, decision, reason);
  try {
    const to = await deps.emailFor(design.userId);
    if (to) {
      await notifyDecision(deps.email, deps.siteUrl, {
        to,
        decision: design.status === 'approved' ? 'approved' : 'rejected',
        designId: design.id,
        reason: design.rejectReason ?? undefined,
      });
    }
  } catch (e) {
    console.error('could not email the customer about design', design.id, e);
  }
  return design;
}

export const ORDER_STATUSES: OrderStatus[] = FLOW;

export type OrderListRow = { order: Order; item: string; note: string };

/** Narrows the admin order list by status and by a search over id, customer, phone, city, item and note. */
export function filterOrders<T extends OrderListRow>(rows: T[], args: { q?: string; status?: string }): T[] {
  const status = ORDER_STATUSES.find((s) => s === args.status);
  const words = (args.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(({ order, item, note }) => {
    if (status && order.status !== status) return false;
    const haystack = [order.id, order.delivery.name, order.delivery.phone, order.delivery.city, item, note].join(' ').toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export interface OrderNoteStore {
  get(orderId: string): Promise<string>;
  /** An empty note removes it. */
  set(orderId: string, note: string): Promise<void>;
}

export const MAX_NOTE_LENGTH = 1000;

/** Saves the admin-only note on an order. */
export async function saveOrderNote(deps: { orders: OrderStore; notes: OrderNoteStore }, id: string, note: unknown): Promise<string> {
  if (typeof note !== 'string') throw new HttpError(400, 'The note must be text.');
  const clean = note.trim();
  if (clean.length > MAX_NOTE_LENGTH) throw new HttpError(400, `Keep the note under ${MAX_NOTE_LENGTH} characters.`);
  if (!(await deps.orders.findById(id))) throw new HttpError(404, 'Order not found.');
  await deps.notes.set(id, clean);
  return clean;
}
