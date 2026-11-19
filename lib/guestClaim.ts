import { layersHash, type Design } from '@/lib/designs';
import type { DesignLayer } from '@/lib/designLayers';

/**
 * A guest's design, moved to the account they signed up or signed in with: the pictures move from the guest's
 * folder to the account's, so the layers point at the new paths. A design that was approved (or sent for review)
 * keeps that standing: only the folder in the paths changed, not what is printed.
 */
export function rehomeDesign(d: Pick<Design, 'layers' | 'backLayers' | 'moderatedHash'>, fromUser: string, toUser: string) {
  const move = (layers: DesignLayer[]) =>
    layers.map((l) => (l.kind === 'image' && l.uploadPath.startsWith(`${fromUser}/`) ? { ...l, uploadPath: `${toUser}/${l.uploadPath.slice(fromUser.length + 1)}` } : l));
  const layers = move(d.layers);
  const backLayers = move(d.backLayers);
  const wasChecked = d.moderatedHash !== null && d.moderatedHash === layersHash(d.layers, d.backLayers);
  return { layers, backLayers, moderatedHash: wasChecked ? layersHash(layers, backLayers) : d.moderatedHash };
}
