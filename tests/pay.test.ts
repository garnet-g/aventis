import { beforeEach, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { catalog, DELIVERY_FEE_PKR } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { saveDesign, submitDesign } from '@/lib/designs';
import { StubImageSafetyProvider } from '@/lib/moderation/image';
import { createPaidOrder, HttpError } from '@/lib/orders';
import { DummyProvider } from '@/lib/payments/dummy';
import type { PaymentProvider } from '@/lib/payments';
import { addUser, newDb } from './helpers/db';
import { MemoryDesignStore } from './helpers/memoryStore';
import { pgOrderStore } from './helpers/pgOrderStore';

const delivery = { name: 'Ali Khan', phone: '03001234567', city: 'Lahore', province: 'Punjab', address: 'House 1, Street 2, Gulberg' };
const text = (t: string): DesignLayer => ({
  kind: 'text', text: t, font: 'Arial', fill: '#111111', direction: 'ltr', rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 }, rotation: 0,
});

class SpyProvider implements PaymentProvider {
  name = 'spy';
  isTestMode = true;
  charges: { amountPkr: number; reference: string }[] = [];
  async charge(args: { amountPkr: number; reference: string }) {
    this.charges.push(args);
    return { ok: true as const, paymentRef: `TEST-${args.reference}` };
  }
}

let db: PGlite;
let designs: MemoryDesignStore;
let alice: string;
let bob: string;

/** Saves a design, runs moderation with the given text, and mirrors it into the real schema for the order FK. */
async function makeDesign(owner: string, content: string, product: 'tee' | 'hoodie' = 'tee') {
  const d = await saveDesign(designs, owner, { product, color: 'white', size: 'M', layers: [text(content)] });
  await submitDesign(designs, new StubImageSafetyProvider(0), d.id, owner);
  const current = (await designs.get(d.id))!;
  await db.query(
    `insert into designs (id, user_id, product, color, size, layers, status) values ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [d.id, owner, product, 'white', 'M', JSON.stringify(current.layers), current.status],
  );
  return current;
}

beforeEach(async () => {
  db = await newDb();
  designs = new MemoryDesignStore();
  alice = await addUser(db, 'alice@example.com');
  bob = await addUser(db, 'bob@example.com');
});

const deps = () => ({ designs, orders: pgOrderStore(db) });

describe('createPaidOrder', () => {
  test('pay on a pending_review design returns 403 and creates no order', async () => {
    const d = await makeDesign(alice, 'Dick');
    expect(d.status).toBe('pending_review');
    const provider = new SpyProvider();
    await expect(createPaidOrder({ ...deps(), provider }, { designId: d.id, userId: alice, delivery })).rejects.toMatchObject({ status: 403 });
    expect(provider.charges).toHaveLength(0);
    expect((await db.query('select 1 from orders')).rows).toHaveLength(0);
  });

  test('pay on a rejected design returns 403', async () => {
    const d = await makeDesign(alice, 'fuck');
    expect(d.status).toBe('rejected');
    await expect(createPaidOrder({ ...deps(), provider: new SpyProvider() }, { designId: d.id, userId: alice, delivery })).rejects.toMatchObject({ status: 403 });
  });

  test('pay on a draft design returns 403', async () => {
    const d = await saveDesign(designs, alice, { product: 'tee', color: 'white', size: 'M', layers: [text('Ali')] });
    await expect(createPaidOrder({ ...deps(), provider: new SpyProvider() }, { designId: d.id, userId: alice, delivery })).rejects.toMatchObject({ status: 403 });
  });

  test('a design whose layers changed after it was approved cannot be paid', async () => {
    const d = await makeDesign(alice, 'Ali');
    await designs.update(d.id, { layers: [text('Something else')] }); // status stays approved, as after a bad write
    const provider = new SpyProvider();
    await expect(createPaidOrder({ ...deps(), provider }, { designId: d.id, userId: alice, delivery })).rejects.toMatchObject({ status: 403 });
    expect(provider.charges).toHaveLength(0);
  });

  test("another user cannot pay for my design", async () => {
    const d = await makeDesign(alice, 'Ali');
    await expect(createPaidOrder({ ...deps(), provider: new SpyProvider() }, { designId: d.id, userId: bob, delivery })).rejects.toMatchObject({ status: 404 });
  });

  test('amount charged equals catalog price plus delivery fee (server-computed)', async () => {
    const provider = new SpyProvider();
    const tee = await makeDesign(alice, 'Ali', 'tee');
    const hoodie = await makeDesign(alice, 'Ali', 'hoodie');
    await createPaidOrder({ ...deps(), provider }, { designId: tee.id, userId: alice, delivery });
    await createPaidOrder({ ...deps(), provider }, { designId: hoodie.id, userId: alice, delivery });
    expect(provider.charges.map((c) => c.amountPkr)).toEqual([
      catalog.tee.pricePkr + DELIVERY_FEE_PKR,
      catalog.hoodie.pricePkr + DELIVERY_FEE_PKR,
    ]);
  });

  test('order records cost, price, fee, and a snapshot of the design layers', async () => {
    const d = await makeDesign(alice, 'Ali', 'hoodie');
    const order = await createPaidOrder({ ...deps(), provider: new SpyProvider() }, { designId: d.id, userId: alice, delivery });
    expect(order).toMatchObject({ status: 'paid', costPkr: 1300, pricePkr: catalog.hoodie.pricePkr, deliveryFeePkr: DELIVERY_FEE_PKR });
    expect(order.layersSnapshot).toEqual(d.layers);
  });

  test('two simultaneous pay calls create exactly one order', async () => {
    const d = await makeDesign(alice, 'Ali');
    const provider = new SpyProvider();
    const [a, b] = await Promise.all([
      createPaidOrder({ ...deps(), provider }, { designId: d.id, userId: alice, delivery }),
      createPaidOrder({ ...deps(), provider }, { designId: d.id, userId: alice, delivery }),
    ]);
    expect(a.id).toBe(b.id);
    expect((await db.query('select 1 from orders')).rows).toHaveLength(1);
  });

  test('paying again after success returns the same order and does not charge again', async () => {
    const d = await makeDesign(alice, 'Ali');
    const provider = new SpyProvider();
    const first = await createPaidOrder({ ...deps(), provider }, { designId: d.id, userId: alice, delivery });
    const second = await createPaidOrder({ ...deps(), provider }, { designId: d.id, userId: alice, delivery });
    expect(second.id).toBe(first.id);
    expect(provider.charges).toHaveLength(1);
  });

  test('invalid phone number is rejected with a field error', async () => {
    const d = await makeDesign(alice, 'Ali');
    await expect(
      createPaidOrder({ ...deps(), provider: new SpyProvider() }, { designId: d.id, userId: alice, delivery: { ...delivery, phone: '12345' } }),
    ).rejects.toMatchObject({ issues: [expect.objectContaining({ path: ['phone'] })] });
  });

  test('accepts +92 and spaced Pakistani mobile numbers', async () => {
    const d = await makeDesign(alice, 'Ali');
    const order = await createPaidOrder({ ...deps(), provider: new SpyProvider() }, { designId: d.id, userId: alice, delivery: { ...delivery, phone: '+92 300 1234567' } });
    expect(order.delivery.phone).toBe('+923001234567');
  });

  test('dummy provider result is marked as test in payment_ref', async () => {
    const d = await makeDesign(alice, 'Ali');
    const order = await createPaidOrder({ ...deps(), provider: new DummyProvider() }, { designId: d.id, userId: alice, delivery });
    expect(order.paymentRef).toBe(`TEST-${d.id}`);
  });

  test('a failed payment creates no order and reports a payment error', async () => {
    const d = await makeDesign(alice, 'Ali');
    const failing: PaymentProvider = { name: 'f', isTestMode: false, charge: async () => ({ ok: false, reason: 'card declined' }) };
    await expect(createPaidOrder({ ...deps(), provider: failing }, { designId: d.id, userId: alice, delivery })).rejects.toMatchObject({ status: 402 });
    expect((await db.query('select 1 from orders')).rows).toHaveLength(0);
  });
});

test('HttpError carries its status', () => {
  expect(new HttpError(403, 'no').status).toBe(403);
});
