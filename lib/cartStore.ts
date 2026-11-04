import type { CartStore } from '@/lib/cart';
import { getServiceClient } from '@/lib/supabase/server';

/** Service-role cart store. The API routes always pass the signed-in user's id; customers can only read their own rows. */
export function supabaseCartStore(): CartStore {
  const db = () => getServiceClient();
  return {
    async list(userId) {
      const { data, error } = await db().from('cart_items').select('design_id, quantity').eq('user_id', userId).order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ designId: r.design_id as string, quantity: r.quantity as number }));
    },
    async add(userId, designId, quantity) {
      // ignoreDuplicates: adding a design that is already in the cart leaves its quantity alone
      const { error } = await db()
        .from('cart_items')
        .upsert({ user_id: userId, design_id: designId, quantity }, { onConflict: 'user_id,design_id', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
    async setQuantity(userId, designId, quantity) {
      const { data, error } = await db().from('cart_items').update({ quantity }).eq('user_id', userId).eq('design_id', designId).select('design_id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
    async remove(userId, designId) {
      const { error } = await db().from('cart_items').delete().eq('user_id', userId).eq('design_id', designId);
      if (error) throw new Error(error.message);
    },
    async clear(userId) {
      const { error } = await db().from('cart_items').delete().eq('user_id', userId);
      if (error) throw new Error(error.message);
    },
  };
}
