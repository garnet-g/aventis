import { generateArtifacts, type ImageLoader } from '@/lib/artifacts';
import type { ArtifactGenerator } from '@/lib/orders';
import { getServiceClient } from '@/lib/supabase/server';

/** Reads customer uploads, but only from the owner's own folder for the design being rendered. */
export function supabaseImageLoader(userId: string, designId: string): ImageLoader {
  const ownPrefix = `${userId}/${designId}/`;
  return async (path) => {
    if (!path.startsWith(ownPrefix)) throw new Error('Invalid upload reference.');
    const { data, error } = await getServiceClient().storage.from('uploads').download(path);
    if (error || !data) throw new Error('Could not read upload.');
    return Buffer.from(await data.arrayBuffer());
  };
}

/** Renders from the order's snapshot (never the live design) and stores the files in the private artifacts bucket. */
export const supabaseArtifactGenerator: ArtifactGenerator = async ({ order, design }) => {
  const db = getServiceClient();
  return generateArtifacts({
    orderId: order.id,
    item: { product: design.product, color: design.color },
    layers: order.layersSnapshot,
    backLayers: order.backLayersSnapshot,
    loadImage: supabaseImageLoader(order.userId, order.designId),
    storage: {
      upload: async (path, data, contentType) => {
        const { error } = await db.storage.from('artifacts').upload(path, data, { contentType, upsert: true });
        if (error) throw new Error(error.message);
      },
    },
  });
};
