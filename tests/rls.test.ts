import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, insertDesign, newDb } from './helpers/db';

let db: PGlite;
let alice: string, bob: string, admin: string;
let aliceDesign: string;

/** Orders may only be created for an approved design whose layers equal the snapshot (the DB enforces it). */
async function insertOrder(designId: string, userId: string, opts: { approve?: boolean; snapshot?: string; backSnapshot?: string } = {}) {
  if (opts.approve !== false) await db.query(`update designs set status = 'approved' where id = $1`, [designId]);
  await db.query(
    `insert into orders (design_id, user_id, status, cost_pkr, price_pkr, delivery_fee_pkr,
       name, phone, city, province, address, payment_ref, layers_snapshot, back_layers_snapshot)
     values ($1,$2,'paid',800,1500,250,'A','03001234567','Lahore','Punjab','1 Road',$3,$4::jsonb,$5::jsonb)`,
    [designId, userId, `TEST-${designId}`, opts.snapshot ?? '[]', opts.backSnapshot ?? '[]'],
  );
}

beforeEach(async () => {
  db = await newDb();
  alice = await addUser(db, 'alice@example.com');
  bob = await addUser(db, 'bob@example.com');
  admin = await addUser(db, 'admin@example.com', { admin: true });
  aliceDesign = await insertDesign(db, alice);
});

// Free each in-process Postgres (WASM memory) as soon as its test is done.
afterEach(async () => {
  await db.close();
});

describe('row-level security', () => {
  test("customer A cannot read customer B's design", async () => {
    const rows = await asUser(db, bob, async () => (await db.query('select id from designs')).rows);
    expect(rows).toHaveLength(0);
    const own = await asUser(db, alice, async () => (await db.query('select id from designs')).rows);
    expect(own).toHaveLength(1);
  });

  test('customer cannot update own design status to approved', async () => {
    await expect(
      asUser(db, alice, () => db.query(`update designs set status = 'approved' where id = $1`, [aliceDesign])),
    ).rejects.toThrow();
    const r = await db.query<{ status: string }>('select status from designs where id = $1', [aliceDesign]);
    expect(r.rows[0].status).toBe('draft');
  });

  test('customer cannot insert an order', async () => {
    await expect(asUser(db, alice, () => insertOrder(aliceDesign, alice))).rejects.toThrow();
  });

  test('customer cannot promote themselves to admin', async () => {
    await asUser(db, alice, () => db.query(`update profiles set is_admin = true where id = $1`, [alice])).catch(() => {});
    const r = await db.query<{ is_admin: boolean }>('select is_admin from profiles where id = $1', [alice]);
    expect(r.rows[0].is_admin).toBe(false);
  });

  test('customer sees only their own orders', async () => {
    await insertOrder(aliceDesign, alice);
    const mine = await asUser(db, alice, async () => (await db.query('select id from orders')).rows);
    const theirs = await asUser(db, bob, async () => (await db.query('select id from orders')).rows);
    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(0);
  });

  test('admin can read all orders and designs', async () => {
    await insertOrder(aliceDesign, alice);
    const orders = await asUser(db, admin, async () => (await db.query('select id from orders')).rows);
    const designs = await asUser(db, admin, async () => (await db.query('select id from designs')).rows);
    expect(orders).toHaveLength(1);
    expect(designs).toHaveLength(1);
  });

  test('customer cannot edit a design that already has an order', async () => {
    await insertOrder(aliceDesign, alice);
    await expect(
      asUser(db, alice, () => db.query(`update designs set layers = '[{"x":1}]'::jsonb where id = $1`, [aliceDesign])),
    ).rejects.toThrow();
    const r = await db.query<{ layers: unknown }>('select layers from designs where id = $1', [aliceDesign]);
    expect(r.rows[0].layers).toEqual([]);
  });

  test('customer cannot write reject_reason', async () => {
    await expect(
      asUser(db, alice, () => db.query(`update designs set reject_reason = 'x' where id = $1`, [aliceDesign])),
    ).rejects.toThrow();
  });

  test('customer cannot insert, update or delete designs directly (all writes go through the API)', async () => {
    await expect(asUser(db, alice, () => insertDesign(db, alice))).rejects.toThrow();
    await expect(
      asUser(db, alice, () => db.query(`update designs set layers = '[{"x":1}]'::jsonb where id = $1`, [aliceDesign])),
    ).rejects.toThrow();
    await expect(asUser(db, alice, () => db.query('delete from designs where id = $1', [aliceDesign]))).rejects.toThrow();
    const r = await db.query<{ layers: unknown }>('select layers from designs where id = $1', [aliceDesign]);
    expect(r.rows[0].layers).toEqual([]);
  });

  test('order stores an immutable snapshot of the design layers', async () => {
    await db.query(`update designs set layers = '[{"x":1}]'::jsonb, status = 'approved' where id = $1`, [aliceDesign]);
    await db.query(
      `insert into orders (design_id, user_id, cost_pkr, price_pkr, delivery_fee_pkr, name, phone, city, province, address, payment_ref, layers_snapshot)
       values ($1,$2,800,1500,250,'A','03001234567','Lahore','Punjab','1 Road',$3,'[{"x":1}]'::jsonb)`,
      [aliceDesign, alice, `TEST-${aliceDesign}`],
    );
    const r = await db.query<{ layers_snapshot: unknown }>('select layers_snapshot from orders where design_id = $1', [aliceDesign]);
    expect(r.rows[0].layers_snapshot).toEqual([{ x: 1 }]);
  });

  test('an order cannot be created for a design that is not approved', async () => {
    await expect(insertOrder(aliceDesign, alice, { approve: false })).rejects.toThrow(/approved design/i);
  });

  test("an order snapshot must equal the design's current layers", async () => {
    await expect(insertOrder(aliceDesign, alice, { snapshot: '[{"x":1}]' })).rejects.toThrow(/approved design/i);
  });

  test('even the service role cannot edit or delete a design that has an order', async () => {
    await insertOrder(aliceDesign, alice);
    await expect(
      db.query(`update designs set layers = '[{"x":1}]'::jsonb where id = $1`, [aliceDesign]),
    ).rejects.toThrow(/already has an order/i);
    await expect(db.query('delete from designs where id = $1', [aliceDesign])).rejects.toThrow();
  });

  test('an order must carry the same back-side layers as the design', async () => {
    await db.query(`update designs set back_layers = '[{"x":1}]'::jsonb where id = $1`, [aliceDesign]);
    await expect(insertOrder(aliceDesign, alice)).rejects.toThrow(/approved design/i);
    await expect(insertOrder(aliceDesign, alice, { backSnapshot: '[{"x":2}]' })).rejects.toThrow(/approved design/i);
    await insertOrder(aliceDesign, alice, { backSnapshot: '[{"x":1}]' });
    expect((await db.query('select 1 from orders')).rows).toHaveLength(1);
  });

  test('once ordered, even the back side of a design cannot be edited', async () => {
    await insertOrder(aliceDesign, alice);
    await expect(db.query(`update designs set back_layers = '[{"x":1}]'::jsonb where id = $1`, [aliceDesign])).rejects.toThrow(/already has an order/i);
  });

  test('a design can only have one order', async () => {
    await insertOrder(aliceDesign, alice);
    await expect(insertOrder(aliceDesign, alice)).rejects.toThrow();
  });
});

describe('carts and checkouts', () => {
  const delivery = JSON.stringify({ name: 'A', phone: '03001234567', city: 'Lahore', province: 'Punjab', address: '1 Road' });
  const items = (ids: string[], quantity = 2) =>
    JSON.stringify(ids.map((id) => ({ design_id: id, quantity, price_pkr: 3000, cost_pkr: 1600 })));
  const checkout = (user: string, ref: string, ids: string[], quantity = 2) =>
    db.query('select * from create_checkout($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)', [user, ref, `PAY-${ref}`, 6250, 250, delivery, items(ids, quantity)]);

  test('a customer reads only their own cart and cannot change it directly', async () => {
    const bobDesign = await insertDesign(db, bob);
    await db.query('insert into cart_items (user_id, design_id, quantity) values ($1,$2,1), ($3,$4,1)', [alice, aliceDesign, bob, bobDesign]);
    const mine = await asUser(db, alice, async () => (await db.query('select design_id from cart_items')).rows);
    expect(mine).toEqual([{ design_id: aliceDesign }]);
    await expect(asUser(db, alice, () => db.query('update cart_items set quantity = 9'))).rejects.toThrow();
    await expect(asUser(db, alice, () => db.query('delete from cart_items'))).rejects.toThrow();
    await expect(asUser(db, alice, () => db.query('insert into cart_items (user_id, design_id, quantity) values ($1,$2,1)', [alice, aliceDesign]))).rejects.toThrow();
  });

  test('a cart quantity must be between 1 and 50', async () => {
    for (const bad of [0, 51, -3]) {
      await expect(db.query('insert into cart_items (user_id, design_id, quantity) values ($1,$2,$3)', [alice, aliceDesign, bad])).rejects.toThrow();
    }
    await db.query('insert into cart_items (user_id, design_id, quantity) values ($1,$2,50)', [alice, aliceDesign]);
  });

  test('create_checkout makes the orders of one payment together, sharing the payment reference', async () => {
    const second = await insertDesign(db, alice, 'approved');
    await db.query(`update designs set status = 'approved' where id = $1`, [aliceDesign]);
    const { rows } = await checkout(alice, 'REF-1', [aliceDesign, second]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((o) => (o as { payment_ref: string }).payment_ref))).toEqual(new Set(['PAY-REF-1']));
    expect(rows.map((o) => (o as { quantity: number }).quantity)).toEqual([2, 2]);
    expect(rows.map((o) => (o as { delivery_fee_pkr: number }).delivery_fee_pkr)).toEqual([250, 0]);
    expect(rows.map((o) => (o as { position: number }).position)).toEqual([1, 2]);
    expect((await db.query('select 1 from checkouts')).rows).toHaveLength(1);
  });

  test('create_checkout is all or nothing: one unapproved design leaves no checkout and no orders', async () => {
    const draft = await insertDesign(db, alice, 'draft');
    await db.query(`update designs set status = 'approved' where id = $1`, [aliceDesign]);
    await expect(checkout(alice, 'REF-2', [aliceDesign, draft])).rejects.toThrow(/approved design/i);
    expect((await db.query('select 1 from orders')).rows).toHaveLength(0);
    expect((await db.query('select 1 from checkouts')).rows).toHaveLength(0);
  });

  test('a cart reference can only ever be used for one checkout', async () => {
    const second = await insertDesign(db, alice, 'approved');
    await db.query(`update designs set status = 'approved' where id = $1`, [aliceDesign]);
    await checkout(alice, 'REF-3', [aliceDesign]);
    await expect(checkout(alice, 'REF-3', [second])).rejects.toThrow();
    expect((await db.query('select 1 from orders')).rows).toHaveLength(1);
  });

  test('an order quantity must be between 1 and 50', async () => {
    await db.query(`update designs set status = 'approved' where id = $1`, [aliceDesign]);
    await expect(checkout(alice, 'REF-4', [aliceDesign], 0)).rejects.toThrow();
    await expect(checkout(alice, 'REF-5', [aliceDesign], 51)).rejects.toThrow();
  });
});
