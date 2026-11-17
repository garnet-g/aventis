import { describe, expect, test } from 'vitest';
import { deleteAccount, type AccountStore } from '@/lib/account';
import type { PaymentStatus } from '@/lib/checkout';
import type { OrderStatus } from '@/lib/orders';

function store(statuses: OrderStatus[], payments: PaymentStatus[] = []) {
  const calls: string[] = [];
  const s: AccountStore = {
    orderStatuses: async () => statuses,
    paymentStatuses: async () => payments,
    deleteEverything: async () => void calls.push('deleteEverything'),
    closeKeepingOrders: async () => void calls.push('closeKeepingOrders'),
  };
  return { s, calls };
}

describe('deleting an account', () => {
  test('needs DELETE typed to confirm', async () => {
    const { s, calls } = store([]);
    await expect(deleteAccount(s, 'u1', 'yes')).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test('with no orders, everything goes', async () => {
    const { s, calls } = store([]);
    expect(await deleteAccount(s, 'u1', ' delete ')).toBe('deleted');
    expect(calls).toEqual(['deleteEverything']);
  });

  test('with finished orders, the orders are kept and the login is closed', async () => {
    const { s, calls } = store(['delivered', 'cancelled']);
    expect(await deleteAccount(s, 'u1', 'DELETE')).toBe('closed');
    expect(calls).toEqual(['closeKeepingOrders']);
  });

  test('waits for a payment in progress or a refund still owed; keeps the record of money that moved', async () => {
    for (const p of ['pending', 'needs_refund'] as PaymentStatus[]) {
      const { s, calls } = store([], ['failed', p]);
      await expect(deleteAccount(s, 'u1', 'DELETE')).rejects.toMatchObject({ status: 409 });
      expect(calls).toEqual([]);
    }
    const refunded = store([], ['refunded']);
    expect(await deleteAccount(refunded.s, 'u1', 'DELETE')).toBe('closed');
    const unanswered = store([], ['failed', 'expired']); // a late payment could still be reported
    expect(await deleteAccount(unanswered.s, 'u1', 'DELETE')).toBe('closed');
    const nothingMoved = store([], ['failed']);
    expect(await deleteAccount(nothingMoved.s, 'u1', 'DELETE')).toBe('deleted');
  });

  test('waits while an order is on its way', async () => {
    const { s, calls } = store(['delivered', 'shipped']);
    await expect(deleteAccount(s, 'u1', 'DELETE')).rejects.toMatchObject({ status: 409 });
    expect(calls).toEqual([]);
  });
});
