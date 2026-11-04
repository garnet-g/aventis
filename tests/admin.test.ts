import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { DesignLayer } from '@/lib/designLayers';
import { layersHash, saveDesign, submitDesign } from '@/lib/designs';
import { StubImageSafetyProvider } from '@/lib/moderation/image';
import { placeCheckout } from '@/lib/orders';
import { MemoryCartStore } from './helpers/memoryCart';
import { DummyProvider } from '@/lib/payments/dummy';
import { addUser, newDb } from './helpers/db';
import { MemoryDesignStore } from './helpers/memoryStore';
import { pgOrderStore } from './helpers/pgOrderStore';

// ---- route guard: a non-admin must get a 404 on every admin route ----
vi.mock('@/lib/auth', () => ({
  requireUser: async () => {
    throw new Error('NOT_FOUND');
  },
  requireAdmin: async () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => ({}), getServiceClient: () => ({}) }));

import { GET as downloadGET } from '../app/api/admin/orders/[id]/download/route';
import { POST as regeneratePOST } from '../app/api/admin/orders/[id]/regenerate/route';
import { POST as statusPOST } from '../app/api/admin/orders/[id]/status/route';
import { GET as previewGET } from '../app/api/admin/designs/[id]/preview/route';
import { POST as decisionPOST } from '../app/api/admin/designs/[id]/decision/route';
import { advanceAndNotify, advanceOrder, artifactPath, decideDesign, nextStatus, orderProfit, regenerateArtifacts, signedDownloadUrl } from '@/lib/admin';

const ctx = { params: Promise.resolve({ id: 'x' }) };
const req = (body?: unknown) => new Request('http://t/x', { method: 'POST', body: JSON.stringify(body ?? {}) });

describe('admin route guard', () => {
  test('non-admin gets 404 on every admin route', async () => {
    const calls = [
      () => decisionPOST(req({ decision: 'approve' }), ctx),
      () => statusPOST(req(), ctx),
      () => regeneratePOST(req(), ctx),
      () => downloadGET(new Request('http://t/x?file=mockup'), ctx),
      () => previewGET(new Request('http://t/x'), ctx),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow('NOT_FOUND');
  });
});

// ---- admin logic against real designs/orders ----
const delivery = { name: 'Ali Khan', phone: '03001234567', city: 'Lahore', province: 'Punjab', address: 'House 1, Street 2, Gulberg' };
const text = (t: string): DesignLayer => ({
  kind: 'text', text: t, font: 'sans', fill: '#111111', direction: 'ltr', fontSize: 0.12,
  rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 }, rotation: 0,
});

let db: PGlite;
let designs: MemoryDesignStore;
let alice: string;

async function designWith(content: string) {
  const d = await saveDesign(designs, alice, { product: 'tee', color: 'white', size: 'M', layers: [text(content)] });
  await submitDesign(designs, new StubImageSafetyProvider(0), d.id, alice);
  return (await designs.get(d.id))!;
}

async function paidOrder() {
  const d = await designWith('Ali');
  await db.query(`insert into designs (id, user_id, product, color, size, layers, status) values ($1,$2,'tee','white','M',$3::jsonb,'approved')`, [d.id, alice, JSON.stringify(d.layers)]);
  const cart = new MemoryCartStore();
  await cart.add(alice, d.id, 1);
  const { orders } = await placeCheckout({ designs, orders: pgOrderStore(db), cart, provider: new DummyProvider() }, { userId: alice, delivery });
  return orders[0];
}

beforeEach(async () => {
  db = await newDb();
  designs = new MemoryDesignStore();
  alice = await addUser(db, 'alice@example.com');
});

// Free each in-process Postgres (WASM memory) as soon as its test is done.
afterEach(async () => {
  await db.close();
});

describe('decideDesign', () => {
  test('approve moves pending_review to approved', async () => {
    const d = await designWith('Dick');
    expect(d.status).toBe('pending_review');
    const out = await decideDesign({ designs }, d.id, 'approve');
    expect(out.status).toBe('approved');
    expect(out.userId).toBe(alice);
  });

  test('approve on an already rejected design is refused', async () => {
    const d = await designWith('fuck');
    await expect(decideDesign({ designs }, d.id, 'approve')).rejects.toThrow(/waiting for review/i);
  });

  test('approve is refused when the design changed after it was checked', async () => {
    const d = await designWith('Dick');
    await designs.update(d.id, { layers: [text('Something else')] }); // changed behind the moderation result
    await expect(decideDesign({ designs }, d.id, 'approve')).rejects.toThrow(/changed/i);
  });

  test('reject stores the admin reason, with a default when none is given', async () => {
    const a = await designWith('Dick');
    expect((await decideDesign({ designs }, a.id, 'reject', 'Not suitable for print')).rejectReason).toBe('Not suitable for print');
    const b = await designWith('Dick');
    expect((await decideDesign({ designs }, b.id, 'reject')).rejectReason).toMatch(/cannot be printed/i);
  });

  test('an approved design is exactly the moderated layers (hash intact)', async () => {
    const d = await designWith('Dick');
    const out = await decideDesign({ designs }, d.id, 'approve');
    expect(out.moderatedHash).toBe(layersHash(out.layers));
  });
});

describe('order status', () => {
  test('nextStatus follows paid, at_printer, shipped, delivered and null after delivered', () => {
    expect(nextStatus('paid')).toBe('at_printer');
    expect(nextStatus('at_printer')).toBe('shipped');
    expect(nextStatus('shipped')).toBe('delivered');
    expect(nextStatus('delivered')).toBeNull();
  });

  test('advanceOrder moves one step at a time and refuses after delivered', async () => {
    const o = await paidOrder();
    const store = pgOrderStore(db);
    expect((await advanceOrder(store, o.id)).status).toBe('at_printer');
    expect((await advanceOrder(store, o.id)).status).toBe('shipped');
    expect((await advanceOrder(store, o.id)).status).toBe('delivered');
    await expect(advanceOrder(store, o.id)).rejects.toThrow(/already delivered/i);
  });

  test('two admins pressing the button at once advance the order only one step', async () => {
    const o = await paidOrder();
    const store = pgOrderStore(db);
    const results = await Promise.allSettled([advanceOrder(store, o.id), advanceOrder(store, o.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await store.findById(o.id))!.status).toBe('at_printer');
  });

  test('advanceOrder on an unknown order is not found', async () => {
    await expect(advanceOrder(pgOrderStore(db), '00000000-0000-0000-0000-000000000000')).rejects.toThrow(/not found/i);
  });
});

describe('money and downloads', () => {
  test('profit equals price plus delivery fee minus cost', async () => {
    const o = await paidOrder();
    expect(orderProfit(o)).toBe(o.pricePkr + o.deliveryFeePkr - o.costPkr);
    expect(orderProfit(o)).toBe(1500 + 250 - 800);
  });

  test('download URL is signed for 60 seconds only', async () => {
    const signer = { createSignedUrl: vi.fn(async (_p: string, ttl: number) => `https://signed/${ttl}`) };
    expect(await signedDownloadUrl(signer, 'o1/design.png')).toBe('https://signed/60');
    expect(signer.createSignedUrl).toHaveBeenCalledWith('o1/design.png', 60);
  });

  test('regenerate renders from the order snapshot and clears the failed flag', async () => {
    const o = await paidOrder();
    const store = pgOrderStore(db);
    await store.markArtifactsFailed(o.id);
    const seen: unknown[] = [];
    const fresh = await regenerateArtifacts(
      { orders: store, designs, artifacts: async (a) => (seen.push(a.order.layersSnapshot), { mockupPath: 'm.png', designFilePath: 'd.png' }) },
      o.id,
    );
    expect(seen[0]).toEqual(o.layersSnapshot);
    expect(fresh).toMatchObject({ mockupPath: 'm.png', designFilePath: 'd.png', artifactsFailed: false });
  });
});

describe('artifactPath', () => {
  const order = { mockupPath: 'o/mockup.png', designFilePath: 'o/design.png', backMockupPath: null, backDesignFilePath: null } as never;
  const withBack = { mockupPath: 'o/mockup.png', designFilePath: 'o/design.png', backMockupPath: 'o/back-mockup.png', backDesignFilePath: 'o/back-design.png' } as never;

  test('picks the stored file for each download', () => {
    expect(artifactPath(order, 'mockup')).toBe('o/mockup.png');
    expect(artifactPath(order, 'design')).toBe('o/design.png');
    expect(artifactPath(withBack, 'back-mockup')).toBe('o/back-mockup.png');
    expect(artifactPath(withBack, 'back-design')).toBe('o/back-design.png');
  });

  test('is null for a back file when the order has no back print', () => {
    expect(artifactPath(order, 'back-mockup')).toBeNull();
    expect(artifactPath(order, 'back-design')).toBeNull();
  });

  test('is null for anything that is not a known file', () => {
    expect(artifactPath(order, '../../etc/passwd' as never)).toBeNull();
  });
});

describe('shipping emails', () => {
  const sent: { to: string; subject: string; text: string }[] = [];
  const email = { send: async (m: { to: string; subject: string; text: string }) => void sent.push(m) };
  const siteUrl = 'https://shop.example';
  const deps = () => ({ orders: pgOrderStore(db), email, emailFor: async () => 'customer@example.com' as string | null, siteUrl });

  beforeEach(() => {
    sent.length = 0;
  });

  test('moving an order to at printer sends no email', async () => {
    const o = await paidOrder();
    const out = await advanceAndNotify(deps(), o.id);
    expect(out.status).toBe('at_printer');
    expect(sent).toHaveLength(0);
  });

  test('moving an order to shipped emails the customer a link to follow it', async () => {
    const o = await paidOrder();
    await advanceAndNotify(deps(), o.id);
    const out = await advanceAndNotify(deps(), o.id);
    expect(out.status).toBe('shipped');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('customer@example.com');
    expect(sent[0].subject).toMatch(/shipped/i);
    expect(sent[0].text).toContain('https://shop.example/orders');
  });

  test('delivered also emails the customer', async () => {
    const o = await paidOrder();
    for (let i = 0; i < 3; i++) await advanceAndNotify(deps(), o.id);
    expect(sent.map((m) => m.subject.toLowerCase()).some((s) => s.includes('delivered'))).toBe(true);
  });

  test('an email failure does not undo the status change', async () => {
    const o = await paidOrder();
    await advanceAndNotify(deps(), o.id);
    const broken = { ...deps(), email: { send: async () => Promise.reject(new Error('smtp down')) } };
    const out = await advanceAndNotify(broken, o.id);
    expect(out.status).toBe('shipped');
    expect((await pgOrderStore(db).findById(o.id))!.status).toBe('shipped');
  });

  test('a customer with no known email address is skipped without error', async () => {
    const o = await paidOrder();
    await advanceAndNotify(deps(), o.id);
    await expect(advanceAndNotify({ ...deps(), emailFor: async () => null }, o.id)).resolves.toMatchObject({ status: 'shipped' });
    expect(sent).toHaveLength(0);
  });
});
