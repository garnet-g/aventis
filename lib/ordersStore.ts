import { DuplicateCheckoutError, type NewCheckout, type Order, type OrderStore } from '@/lib/orders';
import { getServiceClient } from '@/lib/supabase/server';

export type OrderRow = {
  id: string;
  design_id: string;
  user_id: string;
  status: Order['status'];
  quantity: number;
  cost_kes: number;
  price_kes: number;
  delivery_fee_kes: number;
  name: string;
  phone: string;
  city: string;
  county: Order['delivery']['county'];
  address: string;
  payment_ref: string;
  layers_snapshot: Order['layersSnapshot'];
  back_layers_snapshot: Order['backLayersSnapshot'];
  mockup_path: string | null;
  design_file_path: string | null;
  back_mockup_path: string | null;
  back_design_file_path: string | null;
  artifacts_failed: boolean;
};

export const toOrder = (r: OrderRow): Order => ({
  id: r.id,
  designId: r.design_id,
  userId: r.user_id,
  status: r.status,
  quantity: r.quantity ?? 1,
  costKes: r.cost_kes,
  priceKes: r.price_kes,
  deliveryFeeKes: r.delivery_fee_kes,
  delivery: { name: r.name, phone: r.phone, city: r.city, county: r.county, address: r.address },
  paymentRef: r.payment_ref,
  layersSnapshot: r.layers_snapshot,
  backLayersSnapshot: r.back_layers_snapshot ?? [],
  mockupPath: r.mockup_path,
  designFilePath: r.design_file_path,
  backMockupPath: r.back_mockup_path ?? null,
  backDesignFilePath: r.back_design_file_path ?? null,
  artifactsFailed: r.artifacts_failed,
});

/** Service-role order store; a unique cart reference and unique design_id make a repeat checkout fail. */
export function supabaseOrderStore(): OrderStore {
  const db = () => getServiceClient();
  return {
    async findByDesign(designId) {
      const { data } = await db().from('orders').select('*').eq('design_id', designId).maybeSingle();
      return data ? toOrder(data as OrderRow) : null;
    },
    async findById(id) {
      const { data } = await db().from('orders').select('*').eq('id', id).maybeSingle();
      return data ? toOrder(data as OrderRow) : null;
    },
    async setStatus(id, from, to) {
      const { data, error } = await db().from('orders').update({ status: to }).eq('id', id).eq('status', from).select('*');
      if (error) throw new Error(error.message);
      return data && data.length > 0 ? toOrder(data[0] as OrderRow) : null;
    },
    async findCheckoutOrders(reference) {
      const { data: checkout } = await db().from('checkouts').select('id').eq('reference', reference).maybeSingle();
      if (!checkout) return null;
      const { data } = await db().from('orders').select('*').eq('checkout_id', checkout.id).order('position');
      return data && data.length > 0 ? data.map((row) => toOrder(row as OrderRow)) : null;
    },
    async createCheckout(c: NewCheckout) {
      // One database function creates the checkout and every order in a single transaction.
      const { data, error } = await db().rpc('create_checkout', {
        p_user: c.userId,
        p_reference: c.reference,
        p_payment_ref: c.paymentRef,
        p_total_kes: c.totalKes,
        p_delivery_fee_kes: c.deliveryFeeKes,
        p_delivery: c.delivery,
        p_items: c.items.map((i) => ({ design_id: i.designId, quantity: i.quantity, price_kes: i.priceKes, cost_kes: i.costKes })),
      });
      if (error) {
        if (error.code === '23505') throw new DuplicateCheckoutError();
        throw new Error(error.message);
      }
      return (data as OrderRow[]).map(toOrder);
    },
    async setArtifacts(id, p) {
      const { error } = await db().from('orders').update({
          mockup_path: p.mockupPath,
          design_file_path: p.designFilePath,
          back_mockup_path: p.backMockupPath ?? null,
          back_design_file_path: p.backDesignFilePath ?? null,
          artifacts_failed: false,
        }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async markArtifactsFailed(id) {
      const { error } = await db().from('orders').update({ artifacts_failed: true }).eq('id', id);
      if (error) throw new Error(error.message);
    },
  };
}
