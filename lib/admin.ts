import { layersHash, type Design, type DesignStore } from '@/lib/designs';
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
    return { ...order, ...paths, artifactsFailed: false };
  } catch (e) {
    await deps.orders.markArtifactsFailed(order.id).catch(() => undefined);
    throw e;
  }
}

export async function signedDownloadUrl(
  storage: { createSignedUrl(path: string, expiresInSeconds: number): Promise<string> },
  path: string,
): Promise<string> {
  return storage.createSignedUrl(path, SIGNED_URL_SECONDS);
}
