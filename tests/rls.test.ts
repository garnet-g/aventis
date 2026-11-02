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
