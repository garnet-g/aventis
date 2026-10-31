import { layersHash, type Design } from '@/lib/designs';
import { ORDER_STATUS_LABEL } from '@/lib/labels';
import type { OrderStatus } from '@/lib/orders';

export type DesignState = { text: string; action?: { href: string; label: string } };

/** What a customer sees for one of their designs, in plain words. */
export function describeDesign(design: Design, orderStatus: OrderStatus | null): DesignState {
  if (orderStatus) return { text: ORDER_STATUS_LABEL[orderStatus] };
  switch (design.status) {
    case 'pending_review':
      return { text: 'Waiting for review' };
    case 'approved':
      // Approval counts only for the exact layers that were checked.
      return design.moderatedHash === layersHash(design.layers)
        ? { text: 'Approved: ready to pay', action: { href: `/checkout/${design.id}`, label: 'Pay now' } }
        : { text: 'Changed since it was checked', action: { href: '/design', label: 'Submit again' } };
    case 'rejected':
      return {
        text: `Rejected: ${design.rejectReason ?? 'This design cannot be printed.'}`,
        action: { href: '/design', label: 'Start a new design' },
      };
    default:
      return { text: 'Draft', action: { href: '/design', label: 'Continue designing' } };
  }
}

/** Defense in depth on top of row-level security: only ever shows the signed-in customer's own rows. */
export function buildCustomerView(
  userId: string,
  designs: Design[],
  orders: { designId: string; userId: string; status: OrderStatus }[],
) {
  const own = orders.filter((o) => o.userId === userId);
  return designs
    .filter((d) => d.userId === userId)
    .map((design) => ({
      design,
      state: describeDesign(design, own.find((o) => o.designId === design.id)?.status ?? null),
    }));
}
