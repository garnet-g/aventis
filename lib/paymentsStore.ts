import type { PaymentRecord, PaymentStatus, PaymentStore } from '@/lib/checkout';
import { getServiceClient } from '@/lib/supabase/server';

type Row = {
  id: string;
  user_id: string;
  reference: string;
  amount_kes: number;
  delivery_fee_kes: number;
  delivery: PaymentRecord['delivery'];
  items: PaymentRecord['items'];
  phone: string;
  provider: string;
  request_id: string | null;
  status: PaymentStatus;
  provider_ref: string | null;
  failure_reason: string | null;
  created_at: string;
};

export const toPayment = (r: Row): PaymentRecord => ({
  id: r.id,
  userId: r.user_id,
  reference: r.reference,
  amountKes: r.amount_kes,
  deliveryFeeKes: r.delivery_fee_kes,
  delivery: r.delivery,
  items: r.items,
  phone: r.phone,
  provider: r.provider,
  requestId: r.request_id,
  status: r.status,
  providerRef: r.provider_ref,
  failureReason: r.failure_reason,
  createdAt: r.created_at,
});

/** Service-role payment store. Every status change is compare-and-set, so a callback and a status check can't both win. */
export function supabasePaymentStore(): PaymentStore {
  const db = () => getServiceClient();
  return {
    async create(p) {
      const { data, error } = await db()
        .from('payments')
        .insert({
          user_id: p.userId,
          reference: p.reference,
          amount_kes: p.amountKes,
          delivery_fee_kes: p.deliveryFeeKes,
          delivery: p.delivery,
          items: p.items,
          phone: p.phone,
          provider: p.provider,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return toPayment(data as Row);
    },
    async get(id) {
      const { data } = await db().from('payments').select('*').eq('id', id).maybeSingle();
      return data ? toPayment(data as Row) : null;
    },
    async findByRequestId(requestId) {
      const { data } = await db().from('payments').select('*').eq('request_id', requestId).maybeSingle();
      return data ? toPayment(data as Row) : null;
    },
    async latestPending(userId) {
      const { data } = await db().from('payments').select('*').eq('user_id', userId).eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
      return data?.[0] ? toPayment(data[0] as Row) : null;
    },
    async setRequestId(id, requestId) {
      const { error } = await db().from('payments').update({ request_id: requestId }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async hasPaidFrom(userId, phone) {
      const { count } = await db().from('payments').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('phone', phone).in('status', ['paid', 'needs_refund', 'refunded']);
      return (count ?? 0) > 0;
    },
    async transition(id, from, to, fields = {}) {
      const { data, error } = await db()
        .from('payments')
        .update({ status: to, ...(fields.providerRef && { provider_ref: fields.providerRef }), ...(fields.failureReason && { failure_reason: fields.failureReason }), ...(fields.refundRef && { refund_ref: fields.refundRef }) })
        .eq('id', id)
        .in('status', from)
        .select('*');
      if (error) throw new Error(error.message);
      return data?.[0] ? toPayment(data[0] as Row) : null;
    },
  };
}
