import { DuplicateOrderError, type NewOrder, type Order, type OrderStore } from '@/lib/orders';
import { getServiceClient } from '@/lib/supabase/server';

export type OrderRow = {
  id: string;
  design_id: string;
  user_id: string;
  status: Order['status'];
  cost_pkr: number;
  price_pkr: number;
  delivery_fee_pkr: number;
  name: string;
  phone: string;
  city: string;
  province: Order['delivery']['province'];
  address: string;
  payment_ref: string;
  layers_snapshot: Order['layersSnapshot'];
  mockup_path: string | null;
  design_file_path: string | null;
  artifacts_failed: boolean;
};

export const toOrder = (r: OrderRow): Order => ({
  id: r.id,
  designId: r.design_id,
  userId: r.user_id,
  status: r.status,
  costPkr: r.cost_pkr,
  pricePkr: r.price_pkr,
  deliveryFeePkr: r.delivery_fee_pkr,
  delivery: { name: r.name, phone: r.phone, city: r.city, province: r.province, address: r.address },
  paymentRef: r.payment_ref,
  layersSnapshot: r.layers_snapshot,
  mockupPath: r.mockup_path,
  designFilePath: r.design_file_path,
  artifactsFailed: r.artifacts_failed,
});

/** Service-role order store; unique design_id / payment_ref make a duplicate insert fail. */
export function supabaseOrderStore(): OrderStore {
  const db = () => getServiceClient();
  return {
    async findByDesign(designId) {
      const { data } = await db().from('orders').select('*').eq('design_id', designId).maybeSingle();
      return data ? toOrder(data as OrderRow) : null;
    },
    async insert(o: NewOrder) {
      const { data, error } = await db()
        .from('orders')
        .insert({
          design_id: o.designId,
          user_id: o.userId,
          cost_pkr: o.costPkr,
          price_pkr: o.pricePkr,
          delivery_fee_pkr: o.deliveryFeePkr,
          ...o.delivery,
          payment_ref: o.paymentRef,
          layers_snapshot: o.layersSnapshot,
        })
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') throw new DuplicateOrderError();
        throw new Error(error.message);
      }
      return toOrder(data as OrderRow);
    },
    async setArtifacts(id, p) {
      const { error } = await db().from('orders').update({ mockup_path: p.mockupPath, design_file_path: p.designFilePath, artifacts_failed: false }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async markArtifactsFailed(id) {
      const { error } = await db().from('orders').update({ artifacts_failed: true }).eq('id', id);
      if (error) throw new Error(error.message);
    },
  };
}
