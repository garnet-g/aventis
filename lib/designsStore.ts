import type { Design, DesignStore } from '@/lib/designs';
import { getServiceClient } from '@/lib/supabase/server';

type Row = {
  id: string;
  user_id: string;
  product: Design['product'];
  color: Design['color'];
  size: Design['size'];
  layers: Design['layers'];
  status: Design['status'];
  reject_reason: string | null;
  moderated_hash: string | null;
  updated_at: string;
};

const toDesign = (r: Row): Design => ({
  id: r.id,
  userId: r.user_id,
  product: r.product,
  color: r.color,
  size: r.size,
  layers: r.layers,
  status: r.status,
  rejectReason: r.reject_reason,
  moderatedHash: r.moderated_hash,
  version: r.updated_at,
});

const toRow = (p: Partial<Omit<Design, 'id' | 'userId' | 'version'>>) => ({
  ...(p.product && { product: p.product }),
  ...(p.color && { color: p.color }),
  ...(p.size && { size: p.size }),
  ...(p.layers && { layers: p.layers }),
  ...(p.status && { status: p.status }),
  ...(p.rejectReason !== undefined && { reject_reason: p.rejectReason }),
  ...(p.moderatedHash !== undefined && { moderated_hash: p.moderatedHash }),
});

/** Uses the service role: callers (lib/designs.ts) check ownership before every read or write. */
export function supabaseDesignStore(): DesignStore {
  const db = () => getServiceClient();
  return {
    async get(id) {
      const { data } = await db().from('designs').select('*').eq('id', id).maybeSingle();
      return data ? toDesign(data as Row) : null;
    },
    async insert(userId, input) {
      const { data, error } = await db().from('designs').insert({ user_id: userId, ...toRow(input) }).select('*').single();
      if (error) throw new Error(error.message);
      return toDesign(data as Row);
    },
    async update(id, patch) {
      const { data, error } = await db().from('designs').update(toRow(patch)).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      return toDesign(data as Row);
    },
    async updateIfVersion(id, version, patch) {
      // updated_at is bumped by a trigger on every write, so it doubles as the version.
      const { data, error } = await db().from('designs').update(toRow(patch)).eq('id', id).eq('updated_at', version).select('*');
      if (error) throw new Error(error.message);
      return data && data.length > 0 ? toDesign(data[0] as Row) : null;
    },
    async hasOrder(id) {
      const { count } = await db().from('orders').select('id', { count: 'exact', head: true }).eq('design_id', id);
      return (count ?? 0) > 0;
    },
    async downloadUpload(path) {
      const { data, error } = await db().storage.from('uploads').download(path);
      if (error || !data) throw new Error('Could not read upload.');
      return Buffer.from(await data.arrayBuffer());
    },
  };
}
