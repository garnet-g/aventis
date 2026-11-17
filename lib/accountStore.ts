import type { AccountStore } from '@/lib/account';
import type { PaymentStatus } from '@/lib/checkout';
import type { OrderStatus } from '@/lib/orders';
import { getServiceClient } from '@/lib/supabase/server';

/** Removes every file in the customer's own upload folder (one folder per design inside it). */
async function removeUploads(userId: string, keepDesigns: Set<string>) {
  const bucket = getServiceClient().storage.from('uploads');
  const { data: folders } = await bucket.list(userId, { limit: 1000 });
  for (const folder of folders ?? []) {
    if (keepDesigns.has(folder.name)) continue;
    const { data: files } = await bucket.list(`${userId}/${folder.name}`, { limit: 1000 });
    if (files?.length) await bucket.remove(files.map((f) => `${userId}/${folder.name}/${f.name}`));
  }
}

export function supabaseAccountStore(): AccountStore {
  const db = () => getServiceClient();
  return {
    async orderStatuses(userId) {
      const { data, error } = await db().from('orders').select('status').eq('user_id', userId);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.status as OrderStatus);
    },
    async paymentStatuses(userId) {
      const { data, error } = await db().from('payments').select('status').eq('user_id', userId);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.status as PaymentStatus);
    },
    async deleteEverything(userId) {
      await removeUploads(userId, new Set());
      const { error } = await db().auth.admin.deleteUser(userId); // designs, cart, payments and profile cascade
      if (error) throw new Error(error.message);
    },
    async closeKeepingOrders(userId) {
      const { data: ordered } = await db().from('orders').select('design_id').eq('user_id', userId);
      const keep = new Set((ordered ?? []).map((o) => o.design_id as string));
      await removeUploads(userId, keep); // the printed pictures of kept orders stay with them
      await db().from('cart_items').delete().eq('user_id', userId);
      let q = db().from('designs').delete().eq('user_id', userId);
      if (keep.size) q = q.not('id', 'in', `(${[...keep].join(',')})`);
      const { error: designError } = await q;
      if (designError) throw new Error(designError.message);
      // the login can never be used again and no longer says who it was
      const { error } = await db().auth.admin.updateUserById(userId, {
        email: `deleted-${userId}@deleted.invalid`,
        user_metadata: {},
        ban_duration: '876000h',
      });
      if (error) throw new Error(error.message);
    },
  };
}
