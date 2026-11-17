import { describe, expect, test } from 'vitest';
import { deleteAccount, type AccountStore } from '@/lib/account';
import type { OrderStatus } from '@/lib/orders';

function store(statuses: OrderStatus[]) {
  const calls: string[] = [];
  const s: AccountStore = {
    orderStatuses: async () => statuses,
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

  test('waits while an order is on its way', async () => {
    const { s, calls } = store(['delivered', 'shipped']);
    await expect(deleteAccount(s, 'u1', 'DELETE')).rejects.toMatchObject({ status: 409 });
    expect(calls).toEqual([]);
  });
});
