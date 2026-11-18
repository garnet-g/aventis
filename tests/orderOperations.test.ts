import { describe, expect, test } from 'vitest';
import { advanceOrder, cancelAndNotify, canCancel, moveOrderBack, previousStatus, recordRefund } from '@/lib/admin';
import type { EmailMessage } from '@/lib/notify';
import type { Order, OrderStatus, OrderStore, StatusFields } from '@/lib/orders';
import type { SmsSender } from '@/lib/sms';

function order(status: OrderStatus): Order {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    designId: 'd1',
    userId: 'u1',
    status,
    quantity: 1,
    costKes: 600,
    priceKes: 1500,
    deliveryFeeKes: 250,
    delivery: { name: 'Wanjiku', phone: '0712345678', city: 'Nairobi', county: 'Nairobi', address: 'Ngong Rd' } as Order['delivery'],
    paymentRef: 'TKR0000001',
    layersSnapshot: [],
    backLayersSnapshot: [],
    mockupPath: null,
    designFilePath: null,
    backMockupPath: null,
    backDesignFilePath: null,
    artifactsFailed: false,
  };
}

/** Just enough of an order store for the status and refund operations. */
function store(start: Order) {
  let current = { ...start };
  const s: Pick<OrderStore, 'findById' | 'setStatus' | 'markRefunded'> = {
    findById: async (id) => (id === current.id ? { ...current } : null),
    setStatus: async (id, from, to, fields: StatusFields = {}) => {
      if (id !== current.id || current.status !== from) return null;
      current = { ...current, ...fields, status: to };
      return { ...current };
    },
    markRefunded: async (id, { kes, ref }) => {
      if (id !== current.id) return null;
      current = { ...current, refundedKes: kes, refundRef: ref };
      return { ...current };
    },
  };
  return { orders: s as OrderStore, now: () => current };
}

describe('order steps', () => {
  test('moving back undoes one step, never past paid or out of cancelled', async () => {
    expect(previousStatus('shipped')).toBe('at_printer');
    expect(previousStatus('paid')).toBeNull();
    expect(previousStatus('cancelled')).toBeNull();
    const { orders, now } = store(order('shipped'));
    await moveOrderBack(orders, now().id);
    expect(now().status).toBe('at_printer');
    const paid = store(order('paid'));
    await expect(moveOrderBack(paid.orders, paid.now().id)).rejects.toMatchObject({ status: 409 });
  });

  test('shipping records the courier and tracking number, trimmed', async () => {
    const { orders, now } = store(order('at_printer'));
    await advanceOrder(orders, now().id, { courier: '  G4S ', tracking: ' KE123 ' });
    expect(now()).toMatchObject({ status: 'shipped', courier: 'G4S', tracking: 'KE123' });
  });

  test('a cancelled order cannot move on', async () => {
    const { orders, now } = store(order('cancelled'));
    await expect(advanceOrder(orders, now().id)).rejects.toThrow('cancelled');
  });
});

describe('cancelling', () => {
  const deps = (orders: OrderStore) => {
    const mail: EmailMessage[] = [];
    const texts: { to: string; text: string }[] = [];
    const sms: SmsSender = { send: async (to: string, text: string) => void texts.push({ to, text }) } as SmsSender;
    return { mail, texts, deps: { orders, email: { send: async (m: EmailMessage) => void mail.push(m) }, emailFor: async () => 'c@example.com', siteUrl: 'https://vibecrew.co.ke', sms } };
  };

  test('only before shipping, and only with a reason', async () => {
    expect(canCancel('paid')).toBe(true);
    expect(canCancel('at_printer')).toBe(true);
    expect(canCancel('shipped')).toBe(false);
    const shipped = store(order('shipped'));
    await expect(cancelAndNotify(deps(shipped.orders).deps, shipped.now().id, 'Out of stock')).rejects.toMatchObject({ status: 409 });
    const paid = store(order('paid'));
    await expect(cancelAndNotify(deps(paid.orders).deps, paid.now().id, ' ')).rejects.toMatchObject({ status: 400 });
    expect(paid.now().status).toBe('paid');
  });

  test('tells the customer why and how much comes back, by email and SMS', async () => {
    const { orders, now } = store(order('at_printer'));
    const d = deps(orders);
    await cancelAndNotify(d.deps, now().id, 'That colour is out of stock');
    expect(now()).toMatchObject({ status: 'cancelled', cancelReason: 'That colour is out of stock' });
    expect(d.mail[0].text).toContain('That colour is out of stock');
    expect(d.mail[0].text).toContain('KES 1,750');
    expect(d.texts).toHaveLength(1);
    expect(d.texts[0].text).toContain('KES 1,750');
  });
});

describe('recording a refund', () => {
  test('needs whole shillings, no more than was paid, and a reference', async () => {
    const { orders, now } = store(order('cancelled'));
    await expect(recordRefund(orders, now().id, { kes: 1750.5, ref: 'TKR1234567' })).rejects.toMatchObject({ status: 400 });
    await expect(recordRefund(orders, now().id, { kes: 1751, ref: 'TKR1234567' })).rejects.toMatchObject({ status: 400 });
    await expect(recordRefund(orders, now().id, { kes: 1750, ref: 'TK' })).rejects.toMatchObject({ status: 400 });
    await recordRefund(orders, now().id, { kes: '1750', ref: ' TKR1234567 ' });
    expect(now()).toMatchObject({ refundedKes: 1750, refundRef: 'TKR1234567' });
  });
});
