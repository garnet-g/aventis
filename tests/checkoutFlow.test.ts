import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { catalog, DELIVERY_FEE_KES, DELIVERY_FEE_UPCOUNTRY_KES } from '@/lib/catalog';
import { finalizePayment, MemoryPaymentStore, paymentStatus, PROMPT_WINDOW_MS, refreshPayment, startCheckout } from '@/lib/checkout';
import type { DesignLayer } from '@/lib/designLayers';
import { saveDesign, submitDesign } from '@/lib/designs';
import { StubImageSafetyProvider } from '@/lib/moderation/image';
import type { CheckResult, PaymentProvider, StartResult } from '@/lib/payments';
import { DEFAULT_PRICES } from '@/lib/prices';
import { addUser, newDb } from './helpers/db';
import { MemoryCartStore } from './helpers/memoryCart';
import { MemoryDesignStore } from './helpers/memoryStore';
import { pgOrderStore } from './helpers/pgOrderStore';

const delivery = { name: 'Wanjiku Mwangi', phone: '0712345678', city: 'Nairobi', county: 'Nairobi', address: 'Apt 4, Ngong Road, Kilimani' };
const text = (t: string): DesignLayer => ({ kind: 'text', text: t, font: 'sans', fill: '#111111', direction: 'ltr', fontSize: 0.12, rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 }, rotation: 0 });

/** Behaves like M-Pesa: every start is pending; `answer` says how a status check comes out. */
class FakeMpesa implements PaymentProvider {
  name = 'mpesa';
  isTestMode = true;
  starts: { amountKes: number; phone: string }[] = [];
  answer: CheckResult = { status: 'pending' };
  next: StartResult | null = null;
  async start(args: { amountKes: number; reference: string; phone: string; description: string }): Promise<StartResult> {
    this.starts.push({ amountKes: args.amountKes, phone: args.phone });
    return this.next ?? { status: 'pending', requestId: `ws_CO_${this.starts.length}`, message: 'Check your phone' };
  }
  async check() {
    return this.answer;
  }
}

let db: PGlite;
let designs: MemoryDesignStore;
let cart: MemoryCartStore;
let payments: MemoryPaymentStore;
let provider: FakeMpesa;
let alice: string;
let clock: number;

async function approvedDesign(owner: string, words: string, quantity = 1) {
  const d = await saveDesign(designs, owner, { product: 'tee', color: 'black', size: 'M', layers: [text(words)] });
  await submitDesign(designs, new StubImageSafetyProvider(0), d.id, owner);
  const cur = (await designs.get(d.id))!;
  await db.query(`insert into designs (id, user_id, product, color, size, layers, back_layers, status) values ($1,$2,'tee','black','M',$3::jsonb,'[]'::jsonb,'approved')`, [d.id, owner, JSON.stringify(cur.layers)]);
  await cart.add(owner, d.id, quantity);
  return cur;
}

const deps = () => ({ designs, orders: pgOrderStore(db), cart, provider, payments, now: () => clock });

beforeEach(async () => {
  db = await newDb();
  designs = new MemoryDesignStore();
  cart = new MemoryCartStore();
  payments = new MemoryPaymentStore();
  provider = new FakeMpesa();
  alice = await addUser(db, 'alice@example.com');
  clock = Date.now();
});
afterEach(async () => {
  await db.close();
});

describe('paying with M-Pesa', () => {
  test('starting sends one prompt for the exact amount to the M-Pesa number, and creates no orders yet', async () => {
    await approvedDesign(alice, 'Crew');
    const r = await startCheckout(deps(), { userId: alice, delivery, mpesaPhone: '0798 765 432' });
    expect(r.status).toBe('pending');
    expect(provider.starts).toEqual([{ amountKes: catalog.tee.priceKes + DELIVERY_FEE_KES, phone: '254798765432' }]);
    expect((await pgOrderStore(db).findCheckoutOrders(r.payment!.reference))).toBeNull();
    expect(await cart.list(alice)).toHaveLength(1); // nothing is taken out of the cart until the money arrives
  });

  test('the delivery phone is used when no M-Pesa number is given; a non-Safaricom number is refused', async () => {
    await approvedDesign(alice, 'Crew');
    await startCheckout(deps(), { userId: alice, delivery });
    expect(provider.starts[0].phone).toBe('254712345678');
    await expect(startCheckout(deps(), { userId: alice, delivery, mpesaPhone: '0812345678' })).rejects.toMatchObject({ status: 400 });
  });

  test('the callback turns the payment into orders exactly once, and empties the cart of what was paid', async () => {
    await approvedDesign(alice, 'Crew', 2);
    const r = await startCheckout(deps(), { userId: alice, delivery });
    const id = r.payment!.id;
    const first = await finalizePayment(deps(), id, { providerRef: 'TKH7Q2XYZ1', amountKes: r.payment!.amountKes });
    const again = await finalizePayment(deps(), id, { providerRef: 'TKH7Q2XYZ1', amountKes: r.payment!.amountKes });
    expect(first).toMatchObject({ status: 'paid', created: true });
    expect(again).toMatchObject({ status: 'paid', created: false });
    if (first.status !== 'paid' || again.status !== 'paid') throw new Error('expected paid');
    expect(again.orders.map((o) => o.id)).toEqual(first.orders.map((o) => o.id));
    expect(first.orders[0]).toMatchObject({ quantity: 2, paymentRef: 'TKH7Q2XYZ1' });
    expect(await cart.list(alice)).toEqual([]);
  });

  test('a design added to the cart while the prompt was open stays in the cart', async () => {
    await approvedDesign(alice, 'Crew');
    const r = await startCheckout(deps(), { userId: alice, delivery });
    const later = await approvedDesign(alice, 'Later');
    await finalizePayment(deps(), r.payment!.id, { providerRef: 'R1' });
    expect(await cart.list(alice)).toEqual([{ designId: later.id, quantity: 1 }]);
  });

  test('a different amount than expected is held for a refund, not turned into orders', async () => {
    await approvedDesign(alice, 'Crew');
    const r = await startCheckout(deps(), { userId: alice, delivery });
    const done = await finalizePayment(deps(), r.payment!.id, { providerRef: 'R1', amountKes: 1 });
    expect(done.status).toBe('needs_refund');
    expect(await pgOrderStore(db).findCheckoutOrders(r.payment!.reference)).toBeNull();
  });

  test('a design edited while paying: the payment is held for a refund (the database refuses unchecked art)', async () => {
    const d = await approvedDesign(alice, 'Crew');
    const r = await startCheckout(deps(), { userId: alice, delivery });
    await db.query(`update designs set layers = $2::jsonb, status = 'draft' where id = $1`, [d.id, JSON.stringify([text('Changed')])]);
    const done = await finalizePayment(deps(), r.payment!.id, { providerRef: 'R1' });
    expect(done.status).toBe('needs_refund');
    expect((await payments.get(r.payment!.id))!.status).toBe('needs_refund');
  });

  test('pressing Pay again while the prompt is open does not send a second prompt; after the window it does', async () => {
    await approvedDesign(alice, 'Crew');
    const a = await startCheckout(deps(), { userId: alice, delivery });
    const b = await startCheckout(deps(), { userId: alice, delivery });
    expect(b.payment!.id).toBe(a.payment!.id);
    expect(provider.starts).toHaveLength(1);
    clock += PROMPT_WINDOW_MS + 1000;
    const c = await startCheckout(deps(), { userId: alice, delivery });
    expect(c.payment!.id).not.toBe(a.payment!.id);
    expect(provider.starts).toHaveLength(2);
    expect((await payments.get(a.payment!.id))!.status).toBe('expired');
  });

  test('a lost callback is recovered by asking M-Pesa, and a late confirmation still completes an expired payment', async () => {
    await approvedDesign(alice, 'Crew');
    const r = await startCheckout(deps(), { userId: alice, delivery });
    await payments.transition(r.payment!.id, ['pending'], 'expired');
    provider.answer = { status: 'paid' };
    clock += 20_000;
    const s = await paymentStatus(deps(), r.payment!.id, alice);
    expect(s).toMatchObject({ status: 'paid', created: true });
    expect(s.orderIds).toHaveLength(1);
  });

  test('a declined prompt is a failed payment with the reason; the cart is kept', async () => {
    await approvedDesign(alice, 'Crew');
    const r = await startCheckout(deps(), { userId: alice, delivery });
    provider.answer = { status: 'failed', reason: 'The M-Pesa request was cancelled on the phone.' };
    const s = await refreshPayment(deps(), r.payment!);
    expect(s).toMatchObject({ status: 'failed', reason: 'The M-Pesa request was cancelled on the phone.' });
    expect(await cart.list(alice)).toHaveLength(1);
  });

  test("nobody can read someone else's payment", async () => {
    await approvedDesign(alice, 'Crew');
    const r = await startCheckout(deps(), { userId: alice, delivery });
    const bob = await addUser(db, 'bob@example.com');
    await expect(paymentStatus(deps(), r.payment!.id, bob)).rejects.toMatchObject({ status: 404 });
  });

  test('a provider that refuses at once is a 402 and leaves nothing behind but a failed record', async () => {
    await approvedDesign(alice, 'Crew');
    provider.next = { status: 'failed', reason: 'Bad Request - Invalid PhoneNumber' };
    await expect(startCheckout(deps(), { userId: alice, delivery })).rejects.toMatchObject({ status: 402 });
    expect([...payments.rows.values()].map((p) => p.status)).toEqual(['failed']);
  });
});

describe('Kenya pricing at checkout', () => {
  test('delivery outside the Nairobi area costs the upcountry rate', async () => {
    await approvedDesign(alice, 'Crew');
    await startCheckout(deps(), { userId: alice, delivery: { ...delivery, city: 'Kisumu', county: 'Kisumu' } });
    expect(provider.starts[0].amountKes).toBe(catalog.tee.priceKes + DELIVERY_FEE_UPCOUNTRY_KES);
  });

  test('bulk prices count every piece in the cart, so a team order in mixed sizes gets them', async () => {
    // three designs (think S, M and L) of 2 pieces each: 6 pieces is past the 5+ tier
    for (const w of ['S', 'M', 'L']) await approvedDesign(alice, `Team ${w}`, 2);
    await startCheckout(deps(), { userId: alice, delivery });
    const each = Math.round(catalog.tee.priceKes * (100 - DEFAULT_PRICES.bulkTiers[0].percentOff) / 100);
    expect(provider.starts[0].amountKes).toBe(each * 6 + DELIVERY_FEE_KES);
  });
});
