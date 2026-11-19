import { toDesign, type DesignRow } from '@/lib/designsStore';
import { rehomeDesign } from '@/lib/guestClaim';
import { getServiceClient } from '@/lib/supabase/server';

/** Moves everything a guest made (designs, their pictures, the cart) to an account, then removes the guest. */
export async function moveGuestToAccount(guestId: string, userId: string): Promise<{ designs: number }> {
  const db = getServiceClient();
  const uploads = db.storage.from('uploads');
  const { data: rows, error } = await db.from('designs').select('*').eq('user_id', guestId);
  if (error) throw new Error(error.message);
  for (const row of rows ?? []) {
    const d = toDesign(row as DesignRow);
    const { data: files } = await uploads.list(`${guestId}/${d.id}`, { limit: 100 });
    for (const f of files ?? []) {
      const { error: moveError } = await uploads.move(`${guestId}/${d.id}/${f.name}`, `${userId}/${d.id}/${f.name}`);
      if (moveError) throw new Error(`could not move a picture: ${moveError.message}`);
    }
    const next = rehomeDesign(d, guestId, userId);
    const { error: updateError } = await db
      .from('designs')
      .update({ user_id: userId, layers: next.layers, back_layers: next.backLayers, moderated_hash: next.moderatedHash })
      .eq('id', d.id)
      .eq('user_id', guestId);
    if (updateError) throw new Error(updateError.message);
  }
  const { error: cartError } = await db.from('cart_items').update({ user_id: userId }).eq('user_id', guestId);
  if (cartError) throw new Error(cartError.message);
  await db.auth.admin.deleteUser(guestId);
  return { designs: rows?.length ?? 0 };
}
