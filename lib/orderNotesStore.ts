import type { OrderNoteStore } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase/server';

/** Service-role store for the private notes admins keep on orders. */
export function supabaseOrderNoteStore(): OrderNoteStore {
  const db = () => getServiceClient();
  return {
    async get(orderId) {
      const { data } = await db().from('order_notes').select('note').eq('order_id', orderId).maybeSingle();
      return (data?.note as string | undefined) ?? '';
    },
    async set(orderId, note) {
      if (!note) {
        const { error } = await db().from('order_notes').delete().eq('order_id', orderId);
        if (error) throw error;
        return;
      }
      const { error } = await db().from('order_notes').upsert({ order_id: orderId, note, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
  };
}
