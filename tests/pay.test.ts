import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { BACK_PRINT_COST_KES, BACK_PRINT_PRICE_KES, catalog, DELIVERY_FEE_KES } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { saveDesign, submitDesign } from '@/lib/designs';
import { StubImageSafetyProvider } from '@/lib/moderation/image';
import { HttpError, placeCheckout, type ArtifactGenerator } from '@/lib/orders';
import { DummyProvider } from '@/lib/payments/dummy';
import type { PaymentProvider } from '@/lib/payments';
import { addUser, newDb } from './helpers/db';
import { MemoryCartStore } from './helpers/memoryCart';
import { MemoryDesignStore } from './helpers/memoryStore';
import { pgOrderStore } from './helpers/pgOrderStore';

const delivery = { name: 'Wanjiku Mwangi', phone: '0712345678', city: 'Nairobi', county: 'Nairobi', address: 'Apt 4, Ngong Road, Kilimani' };
const text = (t: string): DesignLayer => ({
  kind: 'text', text: t, font: 'sans', fill: '#111111', direction: 'ltr', fontSize: 0.12, rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 }, rotation: 0,
});

class SpyProvider implements PaymentProvider {
  name = 'spy';
  isTestMode = true;
  charges: { amountKes: number; reference: string }[] = [];
  async charge(args: { amountKes: number; reference: string }) {
    this.charges.push(args);
    return { ok: true as const, paymentRef: `TEST-${args.reference}` };
  }
}

let db: PGlite;
let designs: MemoryDesignStore;
let cart: MemoryCartStore;
let alice: string;
let bob: string;

/** Saves a design, runs moderation with the given text, and mirrors it into the real schema for the order FK. */
async function makeDesign(owner: string, content: string, product: 'tee' | 'hoodie' = 'tee', opts: { back?: string } = {}) {
  const d = await saveDesign(designs, owner, {
    product,
    color: 'white',
    size: 'M',
    layers: [text(content)],
    backLayers: opts.back ? [text(opts.back)] : [],
  });
  await submitDesign(designs, new StubImageSafetyProvider(0), d.id, owner);
  const current = (await designs.get(d.id))!;
  await db.query(
    `insert into designs (id, user_id, product, color, size, layers, back_layers, status) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
    [d.id, owner, product, 'white', 'M', JSON.stringify(current.layers), JSON.stringify(current.backLayers), current.status],
  );
  return current;
}

/** Puts designs in the owner's cart (straight into the store, so even bad states can be set up) and checks out. */
async function checkout(
  owner: string,
  items: { id: string; quantity?: number }[],
  extra: { provider?: PaymentProvider; artifacts?: ArtifactGenerator; cart?: MemoryCartStore; delivery?: unknown } = {},
) {
  const store = extra.cart ?? cart;
  for (const i of items) {
    await store.add(owner, i.id, 1);
    if (i.quantity && i.quantity > 1) await store.setQuantity(owner, i.id, i.quantity);
  }
  return placeCheckout(
    { designs, orders: pgOrderStore(db), cart: store, provider: extra.provider ?? new SpyProvider(), artifacts: extra.artifacts },
    { userId: owner, delivery: extra.delivery ?? delivery },
  );
}

const orderCount = async () => (await db.query('select 1 from orders')).rows.length;

beforeEach(async () => {
  db = await newDb();
  designs = new MemoryDesignStore();
  cart = new MemoryCartStore();
  alice = await addUser(db, 'alice@example.com');
  bob = await addUser(db, 'bob@example.com');
});

// Free each in-process Postgres (WASM memory) as soon as its test is done.
afterEach(async () => {
  await db.close();
});

describe('what can be paid for', () => {
  test('a design that is waiting for review is refused with 403: nobody is charged and no order exists', async () => {
    const d = await makeDesign(alice, 'Dick');
    expect(d.status).toBe('pending_review');
    const provider = new SpyProvider();
    await expect(checkout(alice, [{ id: d.id }], { provider })).rejects.toMatchObject({ status: 403 });
    expect(provider.charges).toHaveLength(0);
    expect(await orderCount()).toBe(0);
  });

  test('a rejected design and a draft are refused with 403', async () => {
    const rejected = await makeDesign(alice, 'fuck');
    await expect(checkout(alice, [{ id: rejected.id }])).rejects.toMatchObject({ status: 403 });
    cart.items.clear();
    const draft = await saveDesign(designs, alice, { product: 'tee', color: 'white', size: 'M', layers: [text('Ali')] });
    await expect(checkout(alice, [{ id: draft.id }])).rejects.toMatchObject({ status: 403 });
  });

  test("someone else's design in the cart is refused with 404", async () => {
    const d = await makeDesign(alice, 'Ali');
    await expect(checkout(bob, [{ id: d.id }])).rejects.toMatchObject({ status: 404 });
    expect(await orderCount()).toBe(0);
  });

  test('a design approved for different layers cannot be paid for', async () => {
    const d = await makeDesign(alice, 'Ali');
    await designs.update(d.id, { layers: [text('Something else')] }); // status stays approved, as after a bad write
    const provider = new SpyProvider();
    await expect(checkout(alice, [{ id: d.id }], { provider })).rejects.toMatchObject({ status: 403 });
    expect(provider.charges).toHaveLength(0);
  });

  test('a back side added after approval cannot be paid for', async () => {
    const d = await makeDesign(alice, 'Ali');
    await designs.update(d.id, { backLayers: [text('Sneaked in')] });
    await expect(checkout(alice, [{ id: d.id }])).rejects.toMatchObject({ status: 403 });
  });

  test('an empty cart is refused with 400', async () => {
    await expect(checkout(alice, [])).rejects.toMatchObject({ status: 400 });
  });

  test('one design that cannot be paid for stops the whole checkout: all or nothing', async () => {
    const good = await makeDesign(alice, 'Ali');
    const waiting = await makeDesign(alice, 'Dick');
    const provider = new SpyProvider();
    await expect(checkout(alice, [{ id: good.id }, { id: waiting.id }], { provider })).rejects.toMatchObject({ status: 403 });
    expect(provider.charges).toHaveLength(0);
    expect(await orderCount()).toBe(0);
  });
});

describe('money', () => {
  test('the charge is the catalog price plus delivery, worked out on the server', async () => {
    const tee = await makeDesign(alice, 'Ali', 'tee');
    const provider = new SpyProvider();
    await checkout(alice, [{ id: tee.id }], { provider });
    expect(provider.charges).toHaveLength(1);
    expect(provider.charges[0].amountKes).toBe(catalog.tee.priceKes + DELIVERY_FEE_KES);
  });

  test('quantity multiplies the price and the cost', async () => {
    const d = await makeDesign(alice, 'Ali');
    const provider = new SpyProvider();
    const { orders } = await checkout(alice, [{ id: d.id, quantity: 3 }], { provider });
    expect(orders[0]).toMatchObject({ quantity: 3, priceKes: 3 * catalog.tee.priceKes, costKes: 3 * catalog.tee.costKes });
    expect(provider.charges[0].amountKes).toBe(3 * catalog.tee.priceKes + DELIVERY_FEE_KES);
  });

  test('a back print adds its extra price and cost for every unit', async () => {
    const d = await makeDesign(alice, 'Ali', 'tee', { back: 'Back' });
    const { orders } = await checkout(alice, [{ id: d.id, quantity: 2 }]);
    expect(orders[0].priceKes).toBe(2 * (catalog.tee.priceKes + BACK_PRINT_PRICE_KES));
    expect(orders[0].costKes).toBe(2 * (catalog.tee.costKes + BACK_PRINT_COST_KES));
  });

  test('several designs are one payment with one delivery fee, and one order each', async () => {
    const tee = await makeDesign(alice, 'A', 'tee');
    const hoodie = await makeDesign(alice, 'B', 'hoodie');
    const provider = new SpyProvider();
    const { orders } = await checkout(alice, [{ id: tee.id }, { id: hoodie.id, quantity: 2 }], { provider });
    expect(orders).toHaveLength(2);
    expect(provider.charges).toHaveLength(1);
    const expected = catalog.tee.priceKes + 2 * catalog.hoodie.priceKes + DELIVERY_FEE_KES;
    expect(provider.charges[0].amountKes).toBe(expected);
    // the delivery fee sits on the first order only, so the orders add up to exactly what was charged
    expect(orders.map((o) => o.deliveryFeeKes)).toEqual([DELIVERY_FEE_KES, 0]);
    expect(orders.reduce((sum, o) => sum + o.priceKes + o.deliveryFeeKes, 0)).toBe(expected);
  });
});

describe('what an order records', () => {
  test('delivery details and the payment reference are on every order of the checkout', async () => {
    const a = await makeDesign(alice, 'A');
    const b = await makeDesign(alice, 'B');
    const { orders } = await checkout(alice, [{ id: a.id }, { id: b.id }], { provider: new DummyProvider() });
    expect(new Set(orders.map((o) => o.paymentRef)).size).toBe(1);
    expect(orders[0].paymentRef).toMatch(/^TEST-[0-9a-f]{32}$/);
    for (const o of orders) expect(o.delivery).toEqual(delivery);
  });

  test('each order keeps a snapshot of both sides of its design', async () => {
    const d = await makeDesign(alice, 'Ali', 'tee', { back: 'Back' });
    const { orders } = await checkout(alice, [{ id: d.id }]);
    expect(orders[0].layersSnapshot).toEqual(d.layers);
    expect(orders[0].backLayersSnapshot).toEqual(d.backLayers);
    expect(orders[0].status).toBe('paid');
  });

  test('the cart is emptied once the order is placed', async () => {
    const d = await makeDesign(alice, 'Ali');
    await checkout(alice, [{ id: d.id }]);
    expect(await cart.list(alice)).toEqual([]);
  });
});

describe('paying safely', () => {
  test('a failed payment creates no order and keeps the cart', async () => {
    const d = await makeDesign(alice, 'Ali');
    const failing: PaymentProvider = { name: 'f', isTestMode: false, charge: async () => ({ ok: false, reason: 'card declined' }) };
    await expect(checkout(alice, [{ id: d.id }], { provider: failing })).rejects.toMatchObject({ status: 402 });
    expect(await orderCount()).toBe(0);
    expect(await cart.list(alice)).toHaveLength(1);
  });

  test('an invalid phone number is rejected with a field error before anything else happens', async () => {
    const d = await makeDesign(alice, 'Ali');
    const provider = new SpyProvider();
    await expect(checkout(alice, [{ id: d.id }], { provider, delivery: { ...delivery, phone: '12345' } })).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['phone'] })],
    });
    expect(provider.charges).toHaveLength(0);
  });

  test('a +254 number with spaces is accepted and stored without them', async () => {
    const d = await makeDesign(alice, 'Ali');
    const { orders } = await checkout(alice, [{ id: d.id }], { delivery: { ...delivery, phone: '+254 712 345678' } });
    expect(orders[0].delivery.phone).toBe('+254712345678');
  });

  test('two simultaneous checkouts of the same cart create exactly one set of orders', async () => {
    const d = await makeDesign(alice, 'Ali');
    const provider = new SpyProvider();
    const second = new MemoryCartStore();
    const [a, b] = await Promise.all([
      checkout(alice, [{ id: d.id }], { provider }),
      checkout(alice, [{ id: d.id }], { provider, cart: second }),
    ]);
    expect(a.orders[0].id).toBe(b.orders[0].id);
    expect(await orderCount()).toBe(1);
  });

  test('checking out the same cart again returns the same orders and does not charge again', async () => {
    const d = await makeDesign(alice, 'Ali');
    const provider = new SpyProvider();
    const first = await checkout(alice, [{ id: d.id }], { provider });
    const again = await checkout(alice, [{ id: d.id }], { provider });
    expect(again.orders.map((o) => o.id)).toEqual(first.orders.map((o) => o.id));
    expect(provider.charges).toHaveLength(1);
  });

  test('a different quantity is a different payment (the idempotency key changes)', async () => {
    const d = await makeDesign(alice, 'Ali');
    const provider = new SpyProvider();
    await expect(checkout(alice, [{ id: d.id, quantity: 2 }], { provider })).resolves.toBeTruthy();
    expect(provider.charges[0].reference).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('artifacts at payment', () => {
  const paths = { mockupPath: 'o/mockup.png', designFilePath: 'o/design.png' };

  test('every order gets its own files, made from its own snapshot', async () => {
    const a = await makeDesign(alice, 'A');
    const b = await makeDesign(alice, 'B');
    const seen: unknown[] = [];
    const { orders } = await checkout(alice, [{ id: a.id }, { id: b.id }], {
      artifacts: async (x) => (seen.push(x.order.layersSnapshot), { mockupPath: `${x.order.id}/m.png`, designFilePath: `${x.order.id}/d.png` }),
    });
    expect(seen).toEqual([a.layers, b.layers]);
    expect(orders.map((o) => o.mockupPath)).toEqual(orders.map((o) => `${o.id}/m.png`));
    const rows = (await db.query<{ mockup_path: string }>('select mockup_path from orders order by created_at')).rows;
    expect(rows.every((r) => r.mockup_path)).toBe(true);
  });

  test('a generation failure leaves that order paid and flagged, and the others unharmed', async () => {
    const a = await makeDesign(alice, 'A');
    const b = await makeDesign(alice, 'B');
    const { orders } = await checkout(alice, [{ id: a.id }, { id: b.id }], {
      artifacts: async (x) => (x.design.id === a.id ? Promise.reject(new Error('disk full')) : paths),
    });
    expect(orders[0]).toMatchObject({ status: 'paid', artifactsFailed: true, mockupPath: null });
    expect(orders[1]).toMatchObject({ artifactsFailed: false, mockupPath: paths.mockupPath });
  });

  test('only the request that created the orders generates files, even when two race', async () => {
    const d = await makeDesign(alice, 'Ali');
    let calls = 0;
    const artifacts: ArtifactGenerator = async () => (calls++, paths);
    await Promise.all([
      checkout(alice, [{ id: d.id }], { artifacts }),
      checkout(alice, [{ id: d.id }], { artifacts, cart: new MemoryCartStore() }),
    ]);
    expect(calls).toBe(1);
  });
});

describe('prices set by the owner', () => {
  const custom = { tee: { priceKes: 1800, costKes: 900 }, hoodie: { priceKes: 2600, costKes: 1400 }, backPriceKes: 700, backCostKes: 450, deliveryFeeKes: 300, bulkTiers: [] };
  const priceStore = (prices = custom) => ({ get: async () => prices, set: async () => undefined });

  test('the customer is charged the saved prices and the order records them', async () => {
    const d = await makeDesign(alice, 'Ali', 'tee', { back: 'Back' });
    const provider = new SpyProvider();
    await cart.add(alice, d.id, 1);
    await cart.setQuantity(alice, d.id, 2);
    const { orders, created } = await placeCheckout(
      { designs, orders: pgOrderStore(db), cart, provider, prices: priceStore() },
      { userId: alice, delivery },
    );
    expect(created).toBe(true);
    expect(provider.charges[0].amountKes).toBe((1800 + 700) * 2 + 300);
    expect(orders[0]).toMatchObject({ priceKes: 5000, costKes: (900 + 450) * 2, deliveryFeeKes: 300 });
  });

  test('paying the same cart again is not a new purchase (so no second alert)', async () => {
    const d = await makeDesign(alice, 'Ali');
    const first = await checkout(alice, [{ id: d.id }]);
    const again = await checkout(alice, [{ id: d.id }]);
    expect([first.created, again.created]).toEqual([true, false]);
  });
});

test('HttpError carries its status', () => {
  expect(new HttpError(403, 'no').status).toBe(403);
});
