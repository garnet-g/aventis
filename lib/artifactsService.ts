import { generateArtifacts } from '@/lib/artifacts';
import type { ArtifactGenerator } from '@/lib/orders';
import { getServiceClient } from '@/lib/supabase/server';

/** Renders from the order's snapshot (never the live design) and stores the files in the private artifacts bucket. */
export const supabaseArtifactGenerator: ArtifactGenerator = async ({ order, design }) => {
  const db = getServiceClient();
  const ownPrefix = `${order.userId}/${order.designId}/`;
  return generateArtifacts({
    orderId: order.id,
    item: { product: design.product, color: design.color },
    layers: order.layersSnapshot,
    loadImage: async (path) => {
      if (!path.startsWith(ownPrefix)) throw new Error('Invalid upload reference.');
      const { data, error } = await db.storage.from('uploads').download(path);
      if (error || !data) throw new Error('Could not read upload.');
      return Buffer.from(await data.arrayBuffer());
    },
    storage: {
      upload: async (path, data, contentType) => {
        const { error } = await db.storage.from('artifacts').upload(path, data, { contentType, upsert: true });
        if (error) throw new Error(error.message);
      },
    },
  });
};
