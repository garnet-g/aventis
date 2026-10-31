import type { PGlite } from '@electric-sql/pglite';
import type { NewOrder, Order, OrderStore } from '@/lib/orders';
import { DuplicateOrderError } from '@/lib/orders';

type Row = Record<string, unknown>;

const toOrder = (r: Row): Order => ({
  id: r.id as string,
  designId: r.design_id as string,
  userId: r.user_id as string,
  status: r.status as Order['status'],
  costPkr: r.cost_pkr as number,
  pricePkr: r.price_pkr as number,
  deliveryFeePkr: r.delivery_fee_pkr as number,
  delivery: {
    name: r.name as string,
    phone: r.phone as string,
    city: r.city as string,
    province: r.province as Order['delivery']['province'],
    address: r.address as string,
  },
  paymentRef: r.payment_ref as string,
  layersSnapshot: r.layers_snapshot as Order['layersSnapshot'],
  mockupPath: (r.mockup_path as string) ?? null,
  designFilePath: (r.design_file_path as string) ?? null,
  artifactsFailed: r.artifacts_failed as boolean,
});

/** Order store over the real schema (via PGlite) so unique constraints behave as in production. */
export function pgOrderStore(db: PGlite): OrderStore {
  return {
    async findByDesign(designId) {
      const r = await db.query<Row>('select * from orders where design_id = $1', [designId]);
      return r.rows[0] ? toOrder(r.rows[0]) : null;
    },
    async insert(o: NewOrder) {
      try {
        const r = await db.query<Row>(
          `insert into orders (design_id, user_id, cost_pkr, price_pkr, delivery_fee_pkr, name, phone, city, province, address, payment_ref, layers_snapshot)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) returning *`,
          [o.designId, o.userId, o.costPkr, o.pricePkr, o.deliveryFeePkr, o.delivery.name, o.delivery.phone, o.delivery.city, o.delivery.province, o.delivery.address, o.paymentRef, JSON.stringify(o.layersSnapshot)],
        );
        return toOrder(r.rows[0]);
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new DuplicateOrderError();
        throw e;
      }
    },
    async setArtifacts(id, p) {
      await db.query('update orders set mockup_path = $2, design_file_path = $3, artifacts_failed = false where id = $1', [id, p.mockupPath, p.designFilePath]);
    },
    async markArtifactsFailed(id) {
      await db.query('update orders set artifacts_failed = true where id = $1', [id]);
    },
  };
}
