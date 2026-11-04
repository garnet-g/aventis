import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CartStore } from '@/lib/cart';
import { parseQuantity } from '@/lib/cart';
import { COLORS, printAreaFor, SIZES, type Color, type ProductId, type Side, type Size } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { layersHash, type Design, type DesignStore } from '@/lib/designs';
import { HttpError } from '@/lib/errors';

/** A ready-made design that an admin posted. Customers order it in a colour and size of their choice. */
export type CatalogueItem = {
  id: string;
  title: string;
  description: string;
  product: ProductId;
  /** The garment colours this art looks right on. */
  colors: Color[];
  layers: DesignLayer[];
  backLayers: DesignLayer[];
  /** "<color>-front" / "<color>-back" -> preview picture path in the catalogue bucket. */
  mockups: Record<string, string>;
  published: boolean;
  createdAt: string;
};

export interface CatalogueStore {
  list(opts?: { publishedOnly?: boolean }): Promise<CatalogueItem[]>;
  get(id: string): Promise<CatalogueItem | null>;
  insert(item: Omit<CatalogueItem, 'createdAt'>): Promise<CatalogueItem>;
  update(id: string, patch: Partial<Pick<CatalogueItem, 'published' | 'mockups'>>): Promise<CatalogueItem | null>;
  remove(id: string): Promise<void>;
}

const MIN_FILL = 0.9;

/**
 * Places a picture in the middle of the print area, as large as fits (up to 90% of either side) without changing its shape.
 * The result is in the same units as a customer's layer: fractions of the print area.
 */
export function centeredImageLayer(args: { product: ProductId; side: Side; uploadPath: string; widthPx: number; heightPx: number }): DesignLayer {
  const area = printAreaFor(args.product, args.side);
  const k = Math.min((MIN_FILL * area.widthCm) / args.widthPx, (MIN_FILL * area.heightCm) / args.heightPx);
  const width = (args.widthPx * k) / area.widthCm;
  const height = (args.heightPx * k) / area.heightCm;
  return { kind: 'image', uploadPath: args.uploadPath, rect: { x: (1 - width) / 2, y: (1 - height) / 2, width, height }, rotation: 0 };
}

export const catalogueFieldsSchema = z.object({
  title: z.string().trim().min(2, 'Give the design a title.').max(80, 'Keep the title under 80 characters.'),
  description: z.string().trim().max(500, 'Keep the description under 500 characters.').default(''),
  product: z.enum(['tee', 'hoodie'], { message: 'Choose T-shirt or hoodie.' }),
  colors: z
    .array(z.enum(COLORS))
    .min(1, 'Choose at least one garment colour.')
    .transform((c) => [...new Set(c)]),
});
export type CatalogueFields = z.output<typeof catalogueFieldsSchema>;

export type ArtFile = { buffer: Buffer; ext: 'png' | 'jpg'; mime: string; widthPx: number; heightPx: number };

/** Posts a new design to the catalogue (unpublished until an admin publishes it). */
export async function createCatalogueItem(
  deps: {
    store: CatalogueStore;
    saveArt: (path: string, file: ArtFile) => Promise<void>;
    /** Renders the preview of the layers on a garment, or null if no preview could be made. */
    renderPreview: (args: { product: ProductId; color: Color; side: Side; layers: DesignLayer[] }) => Promise<{ path: string } | null>;
  },
  input: { fields: unknown; front?: ArtFile; back?: ArtFile },
): Promise<CatalogueItem> {
  const parsed = catalogueFieldsSchema.safeParse(input.fields);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Check the details.');
  if (!input.front && !input.back) throw new HttpError(400, 'Upload a picture for the front, the back, or both.');
  const fields = parsed.data;

  const id = randomUUID();
  const layerFor = async (side: Side, file?: ArtFile): Promise<DesignLayer[]> => {
    if (!file) return [];
    const uploadPath = `art/${id}/${side}-${randomUUID()}.${file.ext}`;
    await deps.saveArt(uploadPath, file);
    return [centeredImageLayer({ product: fields.product, side, uploadPath, widthPx: file.widthPx, heightPx: file.heightPx })];
  };
  const layers = await layerFor('front', input.front);
  const backLayers = await layerFor('back', input.back);

  const mockups: Record<string, string> = {};
  for (const color of fields.colors) {
    for (const [side, sideLayers] of [['front', layers], ['back', backLayers]] as const) {
      if (!sideLayers.length) continue;
      const preview = await deps.renderPreview({ product: fields.product, color, side, layers: sideLayers });
      if (preview) mockups[`${color}-${side}`] = preview.path;
    }
  }

  return deps.store.insert({ id, ...fields, layers, backLayers, mockups, published: false });
}

/** The picture to show for a colour: the front if there is one, otherwise the back. */
export function previewKey(item: Pick<CatalogueItem, 'layers' | 'mockups'>, color: Color, side: Side = 'front'): string | null {
  const wanted = `${color}-${side}`;
  if (item.mockups[wanted]) return wanted;
  return Object.keys(item.mockups).find((k) => k.startsWith(`${color}-`)) ?? null;
}

export type CatalogueOrderInput = { color: unknown; size: unknown; quantity?: unknown; customise?: unknown };

/**
 * Turns a catalogue design into the customer's own design. By default it goes straight into their cart (the admins
 * already vetted the art); with `customise` it is left as a draft for the customer to change in the editor.
 */
export async function orderFromCatalogue(
  deps: {
    items: CatalogueStore;
    designs: DesignStore;
    cart: CartStore;
    /** Copies a catalogue picture to the customer's own upload folder. */
    copyArt: (from: string, to: string) => Promise<void>;
  },
  userId: string,
  itemId: string,
  input: CatalogueOrderInput,
): Promise<{ design: Design; inCart: boolean }> {
  const item = await deps.items.get(itemId);
  if (!item || !item.published) throw new HttpError(404, 'This design is not available.');
  const color = COLORS.find((c) => c === input.color);
  if (!color || !item.colors.includes(color)) throw new HttpError(400, 'Choose one of the available colours.');
  const size = SIZES.find((s) => s === input.size) as Size | undefined;
  if (!size) throw new HttpError(400, 'Choose a size.');
  const customise = input.customise === true;
  const quantity = customise ? 1 : parseQuantity(input.quantity ?? 1);

  const draft = await deps.designs.insert(userId, { product: item.product, color, size, layers: [], backLayers: [] });
  const own = async (layers: DesignLayer[]) =>
    Promise.all(
      layers.map(async (l): Promise<DesignLayer> => {
        if (l.kind !== 'image') return l;
        const ext = l.uploadPath.endsWith('.jpg') ? 'jpg' : 'png';
        const to = `${userId}/${draft.id}/${randomUUID()}.${ext}`;
        await deps.copyArt(l.uploadPath, to);
        return { ...l, uploadPath: to };
      }),
    );
  const layers = await own(item.layers);
  const backLayers = await own(item.backLayers);

  if (customise) {
    const design = await deps.designs.update(draft.id, { layers, backLayers });
    return { design, inCart: false };
  }
  const design = await deps.designs.update(draft.id, {
    layers,
    backLayers,
    status: 'approved',
    moderatedHash: layersHash(layers, backLayers),
    rejectReason: null,
  });
  await deps.cart.add(userId, design.id, quantity);
  return { design, inCart: true };
}
