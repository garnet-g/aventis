import { describe, expect, test } from 'vitest';
import { filterOrders, saveOrderNote, type OrderListRow, type OrderNoteStore } from '@/lib/admin';
import { adminAlertRecipients, notifyNewOrder, type EmailSender } from '@/lib/notify';
import type { Order, OrderStore } from '@/lib/orders';
import { DEFAULT_PRICES, parsePrices, pricesFromStored, savePrices, type PriceStore } from '@/lib/prices';
import { checkoutTotals, lineTotals, unitCostKes, unitPriceKes } from '@/lib/pricing';

const order = (id: string, status: Order['status'], name: string, city = 'Nairobi', phone = '0712345678'): Order =>
  ({ id, status, delivery: { name, phone, city, county: 'Nairobi', address: 'House 1' } }) as Order;

const rows: OrderListRow[] = [
  { order: order('aaaa1111', 'paid', 'Wanjiku Mwangi'), item: 'tee · white · M', note: '' },
  { order: order('bbbb2222', 'shipped', 'Amina Hassan', 'Mombasa', '0733111222'), item: 'hoodie · black · L × 3', note: 'Call before delivery' },
  { order: order('cccc3333', 'paid', 'Brian Otieno', 'Mombasa'), item: 'hoodie · white · S', note: '' },
];
const ids = (r: OrderListRow[]) => r.map((x) => x.order.id);

describe('filtering the order list', () => {
  test('no filter keeps everything', () => expect(filterOrders(rows, {})).toHaveLength(3));
  test('by status', () => expect(ids(filterOrders(rows, { status: 'paid' }))).toEqual(['aaaa1111', 'cccc3333']));
  test('an unknown status is ignored rather than hiding every order', () => expect(filterOrders(rows, { status: 'bogus' })).toHaveLength(3));
  test('search ignores case and looks in name, phone, city, order id, item and note', () => {
    expect(ids(filterOrders(rows, { q: 'AMINA' }))).toEqual(['bbbb2222']);
    expect(ids(filterOrders(rows, { q: '0733111' }))).toEqual(['bbbb2222']);
    expect(ids(filterOrders(rows, { q: 'mombasa' }))).toEqual(['bbbb2222', 'cccc3333']);
    expect(ids(filterOrders(rows, { q: 'aaaa' }))).toEqual(['aaaa1111']);
    expect(ids(filterOrders(rows, { q: 'hoodie' }))).toEqual(['bbbb2222', 'cccc3333']);
    expect(ids(filterOrders(rows, { q: 'call before' }))).toEqual(['bbbb2222']);
  });
  test('every word must match, and search combines with status', () => {
    expect(ids(filterOrders(rows, { q: 'mombasa hoodie', status: 'paid' }))).toEqual(['cccc3333']);
    expect(filterOrders(rows, { q: 'mombasa nairobi' })).toHaveLength(0);
  });
});

describe('order notes', () => {
  const orders = { findById: async (id: string) => (id === 'o1' ? ({ id } as Order) : null) } as unknown as OrderStore;
  const notes = () => {
    const saved = new Map<string, string>();
    const store: OrderNoteStore = { get: async (id) => saved.get(id) ?? '', set: async (id, n) => void (n ? saved.set(id, n) : saved.delete(id)) };
    return { saved, store };
  };

  test('saves a trimmed note, and an empty note clears it', async () => {
    const { saved, store } = notes();
    expect(await saveOrderNote({ orders, notes: store }, 'o1', '  printer promised Friday  ')).toBe('printer promised Friday');
    expect(saved.get('o1')).toBe('printer promised Friday');
    await saveOrderNote({ orders, notes: store }, 'o1', '   ');
    expect(saved.has('o1')).toBe(false);
  });
  test('refuses a note that is too long, not text, or for an order that does not exist', async () => {
    const { store } = notes();
    await expect(saveOrderNote({ orders, notes: store }, 'o1', 'x'.repeat(1001))).rejects.toMatchObject({ status: 400 });
    await expect(saveOrderNote({ orders, notes: store }, 'o1', 5)).rejects.toMatchObject({ status: 400 });
    await expect(saveOrderNote({ orders, notes: store }, 'nope', 'hi')).rejects.toMatchObject({ status: 404 });
  });
});

describe('new-order alerts', () => {
  const capture = () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    const email: EmailSender = { send: async (m) => void sent.push(m) };
    return { sent, email };
  };

  test('every admin is emailed once, with a link to the orders', async () => {
    const { sent, email } = capture();
    await notifyNewOrder(email, 'https://vybecrew.pk', { to: ['a@x.pk', 'b@x.pk'], orderCount: 2, totalKes: 6250 });
    expect(sent.map((m) => m.to)).toEqual(['a@x.pk', 'b@x.pk']);
    expect(sent[0].subject).toBe('New order: 2 new orders');
    expect(sent[0].text).toContain('KES 6,250');
    expect(sent[0].text).toContain('https://vybecrew.pk/admin/orders');
  });
  test('a single order reads naturally', async () => {
    const { sent, email } = capture();
    await notifyNewOrder(email, 'http://s', { to: ['a@x.pk'], orderCount: 1, totalKes: 100 });
    expect(sent[0].subject).toBe('New order: 1 new order');
  });
  test('ADMIN_ALERT_EMAILS wins; otherwise every admin account is used', async () => {
    expect(await adminAlertRecipients(' a@x.pk, b@x.pk ,', async () => ['zzz'])).toEqual(['a@x.pk', 'b@x.pk']);
    expect(await adminAlertRecipients(undefined, async () => ['admin@x.pk'])).toEqual(['admin@x.pk']);
    expect(await adminAlertRecipients('  ', async () => ['admin@x.pk'])).toEqual(['admin@x.pk']);
  });
});

describe('editable prices', () => {
  const good = { tee: { priceKes: 1800, costKes: 900 }, hoodie: { priceKes: 2600, costKes: 1400 }, backPriceKes: 700, backCostKes: 450, deliveryFeeKes: 300, bulkTiers: [] };

  test('valid prices are accepted and saved', async () => {
    let stored = DEFAULT_PRICES;
    const store: PriceStore = { get: async () => stored, set: async (p) => void (stored = p) };
    expect(await savePrices(store, good)).toEqual(good);
    expect(stored).toEqual(good);
  });
  test('bad prices are refused with 400 and nothing is saved', async () => {
    const store: PriceStore = {
      get: async () => DEFAULT_PRICES,
      set: async () => {
        throw new Error('should not save');
      },
    };
    const bads = [null, {}, { ...good, deliveryFeeKes: -1 }, { ...good, tee: { priceKes: 1.5, costKes: 1 } }, { ...good, backPriceKes: '700' }, { ...good, hoodie: { priceKes: 2e9, costKes: 1 } }, { ...good, deliveryFeeKes: null }];
    for (const bad of bads) await expect(savePrices(store, bad)).rejects.toMatchObject({ status: 400 });
  });
  test('free delivery (0) is allowed', () => expect(parsePrices({ ...good, deliveryFeeKes: 0 }).deliveryFeeKes).toBe(0));
  test('something broken in the database falls back to the defaults', () => {
    expect(pricesFromStored({ tee: 1 })).toEqual(DEFAULT_PRICES);
    expect(pricesFromStored(null)).toEqual(DEFAULT_PRICES);
    expect(pricesFromStored(good)).toEqual(good);
  });
  test('pricing uses the prices it is given, the back extra only when the back is printed', () => {
    const front = { product: 'hoodie' as const, backLayers: [] };
    const both = { product: 'hoodie' as const, backLayers: [{}] };
    expect(unitPriceKes(front, good)).toBe(2600);
    expect(unitPriceKes(both, good)).toBe(3300);
    expect(unitCostKes(both, good)).toBe(1850);
    expect(lineTotals(both, 2, good)).toEqual({ priceKes: 6600, costKes: 3700 });
    expect(checkoutTotals([{ priceKes: 6600 }], good)).toEqual({ subtotalKes: 6600, deliveryFeeKes: 300, totalKes: 6900 });
    expect(checkoutTotals([], good).deliveryFeeKes).toBe(0);
  });
});
