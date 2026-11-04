import type { PGlite } from '@electric-sql/pglite';
import type { NewCheckout, Order, OrderStore } from '@/lib/orders';
import { DuplicateCheckoutError } from '@/lib/orders';

type Row = Record<string, unknown>;

const toOrder = (r: Row): Order => ({
  id: r.id as string,
  designId: r.design_id as string,
  userId: r.user_id as string,
  status: r.status as Order['status'],
  quantity: r.quantity as number,
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
  backLayersSnapshot: r.back_layers_snapshot as Order['backLayersSnapshot'],
  mockupPath: (r.mockup_path as string) ?? null,
  designFilePath: (r.design_file_path as string) ?? null,
  backMockupPath: (r.back_mockup_path as string) ?? null,
  backDesignFilePath: (r.back_design_file_path as string) ?? null,
  artifactsFailed: r.artifacts_failed as boolean,
});

/** Order store over the real schema (via PGlite) so constraints, triggers and the checkout function behave as in production. */
export function pgOrderStore(db: PGlite): OrderStore {
  return {
    async findByDesign(designId) {
      const r = await db.query<Row>('select * from orders where design_id = $1', [designId]);
      return r.rows[0] ? toOrder(r.rows[0]) : null;
    },
    async findById(id) {
      const r = await db.query<Row>('select * from orders where id = $1', [id]);
      return r.rows[0] ? toOrder(r.rows[0]) : null;
    },
    async findCheckoutOrders(reference) {
      const r = await db.query<Row>(
        'select o.* from orders o join checkouts c on c.id = o.checkout_id where c.reference = $1 order by o.position',
        [reference],
      );
      return r.rows.length ? r.rows.map(toOrder) : null;
    },
    async setStatus(id, from, to) {
      const r = await db.query<Row>('update orders set status = $3 where id = $1 and status = $2 returning *', [id, from, to]);
      return r.rows[0] ? toOrder(r.rows[0]) : null;
    },
    async createCheckout(c: NewCheckout) {
      try {
        const items = c.items.map((i) => ({ design_id: i.designId, quantity: i.quantity, price_pkr: i.pricePkr, cost_pkr: i.costPkr }));
        const r = await db.query<Row>('select * from create_checkout($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)', [
          c.userId,
          c.reference,
          c.paymentRef,
          c.totalPkr,
          c.deliveryFeePkr,
          JSON.stringify(c.delivery),
          JSON.stringify(items),
        ]);
        return r.rows.map(toOrder);
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new DuplicateCheckoutError();
        throw e;
      }
    },
    async setArtifacts(id, p) {
      await db.query(
        'update orders set mockup_path = $2, design_file_path = $3, back_mockup_path = $4, back_design_file_path = $5, artifacts_failed = false where id = $1',
        [id, p.mockupPath, p.designFilePath, p.backMockupPath ?? null, p.backDesignFilePath ?? null],
      );
    },
    async markArtifactsFailed(id) {
      await db.query('update orders set artifacts_failed = true where id = $1', [id]);
    },
  };
}
