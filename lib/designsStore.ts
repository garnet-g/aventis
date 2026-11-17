import type { Design, DesignStore } from '@/lib/designs';
import { getServiceClient } from '@/lib/supabase/server';

export type DesignRow = {
  id: string;
  user_id: string;
  product: Design['product'];
  color: Design['color'];
  size: Design['size'];
  layers: Design['layers'];
  back_layers: Design['backLayers'];
  status: Design['status'];
  reject_reason: string | null;
  moderated_hash: string | null;
  catalogue_item_id?: string | null;
  updated_at: string;
};

export const toDesign = (r: DesignRow): Design => ({
  id: r.id,
  userId: r.user_id,
  product: r.product,
  color: r.color,
  size: r.size,
  layers: r.layers,
  backLayers: r.back_layers ?? [],
  status: r.status,
  rejectReason: r.reject_reason,
  moderatedHash: r.moderated_hash,
  catalogueItemId: r.catalogue_item_id ?? null,
  version: r.updated_at,
});

const toRow = (p: Partial<Omit<Design, 'id' | 'userId' | 'version'>>) => ({
  ...(p.product && { product: p.product }),
  ...(p.color && { color: p.color }),
  ...(p.size && { size: p.size }),
  ...(p.layers && { layers: p.layers }),
  ...(p.backLayers && { back_layers: p.backLayers }),
  ...(p.status && { status: p.status }),
  ...(p.rejectReason !== undefined && { reject_reason: p.rejectReason }),
  ...(p.moderatedHash !== undefined && { moderated_hash: p.moderatedHash }),
  ...(p.catalogueItemId !== undefined && { catalogue_item_id: p.catalogueItemId }),
});

/** Uses the service role: callers (lib/designs.ts) check ownership before every read or write. */
export function supabaseDesignStore(): DesignStore {
  const db = () => getServiceClient();
  // the review reason lives in a table only the server can read (customers can read their own designs rows)
  const saveReviewReason = async (id: string, reason: string | null | undefined) => {
    if (reason === undefined) return;
    const t = db().from('design_review_reasons');
    const { error } = reason ? await t.upsert({ design_id: id, reason }) : await t.delete().eq('design_id', id);
    if (error) console.error('could not save the review reason for design', id, error.message);
  };
  return {
    async get(id) {
      const { data } = await db().from('designs').select('*').eq('id', id).maybeSingle();
      return data ? toDesign(data as DesignRow) : null;
    },
    async insert(userId, input) {
      const { data, error } = await db().from('designs').insert({ user_id: userId, ...toRow(input) }).select('*').single();
      if (error) throw new Error(error.message);
      return toDesign(data as DesignRow);
    },
    async update(id, patch) {
      const { data, error } = await db().from('designs').update(toRow(patch)).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      await saveReviewReason(id, patch.reviewReason);
      return toDesign(data as DesignRow);
    },
    async updateIfVersion(id, version, patch) {
      // updated_at is bumped by a trigger on every write, so it doubles as the version.
      const { data, error } = await db().from('designs').update(toRow(patch)).eq('id', id).eq('updated_at', version).select('*');
      if (error) throw new Error(error.message);
      if (!data?.length) return null;
      await saveReviewReason(id, patch.reviewReason);
      return toDesign(data[0] as DesignRow);
    },
    async hasOrder(id) {
      const { count } = await db().from('orders').select('id', { count: 'exact', head: true }).eq('design_id', id);
      return (count ?? 0) > 0;
    },
    async remove(id) {
      const { data } = await db().from('designs').select('user_id').eq('id', id).maybeSingle();
      const { error } = await db().from('designs').delete().eq('id', id);
      if (error) throw new Error(error.message);
      if (!data) return;
      // the pictures uploaded for it: best effort, a leftover is swept up later
      const folder = `${data.user_id}/${id}`;
      const { data: files } = await db().storage.from('uploads').list(folder, { limit: 100 });
      if (files?.length) await db().storage.from('uploads').remove(files.map((f) => `${folder}/${f.name}`));
    },
    async downloadUpload(path) {
      const { data, error } = await db().storage.from('uploads').download(path);
      if (error || !data) throw new Error('Could not read upload.');
      return Buffer.from(await data.arrayBuffer());
    },
  };
}
