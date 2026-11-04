import { randomUUID } from 'node:crypto';
import { renderDesignPng, renderMockupPng, type ImageLoader } from '@/lib/artifacts';
import type { Color } from '@/lib/catalog';
import type { ArtFile, CatalogueItem, CatalogueStore } from '@/lib/catalogueItems';
import type { DesignLayer } from '@/lib/designLayers';
import { getServiceClient } from '@/lib/supabase/server';

const BUCKET = 'catalogue';

type Row = {
  id: string;
  title: string;
  description: string;
  product: CatalogueItem['product'];
  colors: Color[];
  layers: DesignLayer[];
  back_layers: DesignLayer[];
  mockups: Record<string, string>;
  published: boolean;
  created_at: string;
};

const toItem = (r: Row): CatalogueItem => ({
  id: r.id,
  title: r.title,
  description: r.description,
  product: r.product,
  colors: r.colors,
  layers: r.layers,
  backLayers: r.back_layers,
  mockups: r.mockups,
  published: r.published,
  createdAt: r.created_at,
});

/** Where a catalogue picture can be seen in the browser. The bucket is public. */
export const cataloguePictureUrl = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

export function supabaseCatalogueStore(): CatalogueStore {
  const db = () => getServiceClient();
  return {
    async list(opts) {
      let q = db().from('catalogue_items').select('*').order('created_at', { ascending: false });
      if (opts?.publishedOnly) q = q.eq('published', true);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data as Row[]).map(toItem);
    },
    async get(id) {
      const { data } = await db().from('catalogue_items').select('*').eq('id', id).maybeSingle();
      return data ? toItem(data as Row) : null;
    },
    async insert(item) {
      const { data, error } = await db()
        .from('catalogue_items')
        .insert({
          id: item.id,
          title: item.title,
          description: item.description,
          product: item.product,
          colors: item.colors,
          layers: item.layers,
          back_layers: item.backLayers,
          mockups: item.mockups,
          published: item.published,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return toItem(data as Row);
    },
    async update(id, patch) {
      const { data } = await db()
        .from('catalogue_items')
        .update({ ...(patch.published !== undefined && { published: patch.published }), ...(patch.mockups && { mockups: patch.mockups }) })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      return data ? toItem(data as Row) : null;
    },
    async remove(id) {
      const { data } = await db().from('catalogue_items').select('layers, back_layers, mockups').eq('id', id).maybeSingle();
      const { error } = await db().from('catalogue_items').delete().eq('id', id);
      if (error) throw new Error(error.message);
      const row = data as Pick<Row, 'layers' | 'back_layers' | 'mockups'> | null;
      const files = [
        ...Object.values(row?.mockups ?? {}),
        ...[...(row?.layers ?? []), ...(row?.back_layers ?? [])].flatMap((l) => (l.kind === 'image' ? [l.uploadPath] : [])),
      ];
      if (files.length) await db().storage.from(BUCKET).remove(files); // best effort: a leftover file is harmless
    },
  };
}

export async function saveCatalogueArt(path: string, file: ArtFile) {
  const { error } = await getServiceClient().storage.from(BUCKET).upload(path, file.buffer, { contentType: file.mime });
  if (error) throw new Error(error.message);
}

const loadCatalogueArt: ImageLoader = async (path) => {
  const { data, error } = await getServiceClient().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error('Could not read the picture.');
  return Buffer.from(await data.arrayBuffer());
};

/** Renders the layers on a garment photo and stores the preview. Returns null if rendering fails (the item still posts). */
export async function renderCataloguePreview(args: { product: CatalogueItem['product']; color: Color; side: 'front' | 'back'; layers: DesignLayer[] }) {
  try {
    const item = { product: args.product, color: args.color, side: args.side };
    const png = await renderMockupPng(item, await renderDesignPng(item, args.layers, loadCatalogueArt));
    const path = `previews/${randomUUID()}-${args.color}-${args.side}.png`;
    const { error } = await getServiceClient().storage.from(BUCKET).upload(path, png, { contentType: 'image/png' });
    if (error) throw new Error(error.message);
    return { path };
  } catch (e) {
    console.error('could not render a catalogue preview', e);
    return null;
  }
}

/** Copies a catalogue picture into a customer's own upload folder (the editor and the printer files read it from there). */
export async function copyCatalogueArtToUploads(from: string, to: string) {
  const bytes = await loadCatalogueArt(from);
  const { error } = await getServiceClient().storage.from('uploads').upload(to, bytes, { contentType: to.endsWith('.jpg') ? 'image/jpeg' : 'image/png' });
  if (error) throw new Error(error.message);
}
