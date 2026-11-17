import { HttpError } from '@/lib/errors';
import type { PaymentStatus } from '@/lib/checkout';
import type { OrderStatus } from '@/lib/orders';

export interface AccountStore {
  /** The status of every order the account has placed. */
  orderStatuses(userId: string): Promise<OrderStatus[]>;
  /** The status of every M-Pesa payment the account has started. */
  paymentStatuses(userId: string): Promise<PaymentStatus[]>;
  /** Removes the login and everything that hangs off it (designs, cart, payments, uploads). */
  deleteEverything(userId: string): Promise<void>;
  /** Removes what isn't needed for the kept orders (unordered designs, cart, uploads) and scrubs and locks the login. */
  closeKeepingOrders(userId: string): Promise<void>;
}

const FINISHED: OrderStatus[] = ['delivered', 'cancelled'];
/** Payments where money moved: their records are kept, like orders. */
const MONEY_MOVED: PaymentStatus[] = ['paid', 'refunded'];

/**
 * Deletes a customer's account. Paid orders are business records Kenyan tax law says to keep (five years), so an
 * account with orders is closed instead: the login is scrubbed and locked, saved designs and uploads go, and the
 * orders stay. Orders still on their way must arrive (or be cancelled) first.
 */
export async function deleteAccount(store: AccountStore, userId: string, confirm: unknown): Promise<'deleted' | 'closed'> {
  if (typeof confirm !== 'string' || confirm.trim().toUpperCase() !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
  const statuses = await store.orderStatuses(userId);
  if (statuses.some((s) => !FINISHED.includes(s))) {
    throw new HttpError(409, 'You have an order on its way. You can delete your account once it has been delivered.');
  }
  const payments = await store.paymentStatuses(userId);
  if (payments.includes('pending')) throw new HttpError(409, 'A payment is still going through. Try again in a few minutes.');
  if (payments.includes('needs_refund')) throw new HttpError(409, 'We still owe you a refund. You can delete your account once it has been sent.');
  if (!statuses.length && !payments.some((p) => MONEY_MOVED.includes(p))) {
    await store.deleteEverything(userId);
    return 'deleted';
  }
  await store.closeKeepingOrders(userId);
  return 'closed';
}
