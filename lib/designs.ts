import { createHash } from 'node:crypto';
import { z } from 'zod';
import { catalog, COLORS, SIZES } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { normalizeFont } from '@/lib/fonts';
import { moderateDesign } from '@/lib/moderation';
import type { ImageSafetyProvider } from '@/lib/moderation/image';

export type DesignStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

export type Design = {
  id: string;
  userId: string;
  product: keyof typeof catalog;
  color: (typeof COLORS)[number];
  size: (typeof SIZES)[number];
  /** What is printed on the front, and on the back (empty when the back is not printed). */
  layers: DesignLayer[];
  backLayers: DesignLayer[];
  status: DesignStatus;
  rejectReason: string | null;
  /** Hash of the layers that were last moderated; lets an unchanged resubmit skip re-moderation. */
  moderatedHash: string | null;
  /** Changes on every write; lets submitDesign detect an edit that happened while it was checking. */
  version: string;
};

export interface DesignStore {
  get(id: string): Promise<Design | null>;
  insert(userId: string, input: Pick<Design, 'product' | 'color' | 'size' | 'layers' | 'backLayers'>): Promise<Design>;
  update(id: string, patch: Partial<Omit<Design, 'id' | 'userId' | 'version'>>): Promise<Design>;
  /** Applies the patch only if the design still has `version`; returns null when it changed in the meantime. */
  updateIfVersion(id: string, version: string, patch: Partial<Omit<Design, 'id' | 'userId' | 'version'>>): Promise<Design | null>;
  /** True once the design has been paid for; such designs are frozen. */
  hasOrder(id: string): Promise<boolean>;
  downloadUpload(path: string): Promise<Buffer>;
}

// Rects are fractions of the print area; anything outside 0..1 would print off the garment's print area.
const EPS = 0.001;
const rectSchema = z
  .object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() })
  .refine((r) => r.x >= -EPS && r.y >= -EPS && r.x + r.width <= 1 + EPS && r.y + r.height <= 1 + EPS, {
    message: 'Design must stay inside the print area.',
  });

const layerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image'),
    uploadPath: z.string().max(200),
    rect: rectSchema,
    rotation: z.number().min(-360).max(360),
    flipX: z.boolean().optional(),
    flipY: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('text'),
    text: z.string().min(1).max(60),
    // Old designs stored a CSS font stack; anything that is not a known font key becomes the default.
    font: z.string().max(200).transform(normalizeFont),
    fill: z.string().regex(/^#[0-9a-f]{6}$/i),
    direction: z.enum(['ltr', 'rtl']),
    fontSize: z.number().positive().max(1),
    rect: rectSchema,
    rotation: z.number().min(-360).max(360),
  }),
]);

const inputSchema = z.object({
  product: z.enum(Object.keys(catalog) as [keyof typeof catalog, ...(keyof typeof catalog)[]]),
  color: z.enum(COLORS),
  size: z.enum(SIZES),
  layers: z.array(layerSchema).max(20),
  backLayers: z.array(layerSchema).max(20).default([]),
});

export type DesignInput = z.input<typeof inputSchema>;

/** One hash for the whole design: a change on either side changes it, so an approval only ever covers what was checked. */
export const layersHash = (layers: DesignLayer[], backLayers: DesignLayer[] = []) =>
  createHash('sha256').update(JSON.stringify({ front: layers, back: backLayers })).digest('hex');

const UPLOAD_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/;

/** Image layers may only reference files this server stored for this very design: `<user>/<design>/<uuid>.png|jpg`. */
function assertUploadsOwned(userId: string, designId: string, layers: DesignLayer[]) {
  for (const l of layers) {
    if (l.kind !== 'image') continue;
    const parts = l.uploadPath.split('/');
    if (parts.length !== 3 || parts[0] !== userId || parts[1] !== designId || !UPLOAD_FILE.test(parts[2])) {
      throw new Error('Invalid upload reference.');
    }
  }
}

const NOT_FOUND = 'Design not found.';
const EXPLICIT_REASON = 'This design appears to contain explicit content and cannot be printed.';

/** Creates or updates a design. Any save puts the design back to draft, so it must be checked again. */
export async function saveDesign(store: DesignStore, userId: string, input: DesignInput, id?: string): Promise<Design> {
  const parsed = inputSchema.parse(input);
  const layers = parsed.layers as DesignLayer[];
  const backLayers = parsed.backLayers as DesignLayer[];

  if (!id) {
    // Uploads belong to an existing design, so a brand-new design cannot reference any yet.
    if ([...layers, ...backLayers].some((l) => l.kind === 'image')) throw new Error('Invalid upload reference.');
    return store.insert(userId, { ...parsed, layers, backLayers });
  }

  const existing = await store.get(id);
  if (!existing || existing.userId !== userId) throw new Error(NOT_FOUND);
  if (await store.hasOrder(id)) throw new Error('This design already has an order and cannot be changed.');
  assertUploadsOwned(userId, id, [...layers, ...backLayers]);
  return store.update(id, { ...parsed, layers, backLayers, status: 'draft', rejectReason: null });
}

function resultFor(d: Design): { status: 'approved' | 'pending_review' | 'rejected'; message: string } {
  if (d.status === 'approved') return { status: 'approved', message: 'Design approved. You can continue to payment.' };
  if (d.status === 'pending_review') {
    return { status: 'pending_review', message: 'Waiting for review. We will let you know once it has been checked.' };
  }
  return { status: 'rejected', message: d.rejectReason ?? EXPLICIT_REASON };
}

/** Runs the safety check and moves the design to approved, pending_review or rejected. */
export async function submitDesign(store: DesignStore, provider: ImageSafetyProvider, id: string, userId: string) {
  const d = await store.get(id);
  if (!d || d.userId !== userId) throw new Error(NOT_FOUND);
  if (d.layers.length === 0 && d.backLayers.length === 0) throw new Error('Add something to print first.');

  // Never trust what is stored: it could have been written by something other than saveDesign.
  const layers = z.array(layerSchema).max(20).parse(d.layers) as DesignLayer[];
  const backLayers = z.array(layerSchema).max(20).parse(d.backLayers) as DesignLayer[];
  const everything = [...layers, ...backLayers];
  assertUploadsOwned(userId, id, everything);

  const hash = layersHash(d.layers, d.backLayers);
  if (d.status !== 'draft' && d.moderatedHash === hash) return resultFor(d);

  const texts = everything.flatMap((l) => (l.kind === 'text' ? [l.text] : []));
  const images = await Promise.all(everything.flatMap((l) => (l.kind === 'image' ? [store.downloadUpload(l.uploadPath)] : [])));
  const verdict = await moderateDesign({ texts, images }, provider);

  const status: DesignStatus = verdict === 'clear' ? 'approved' : verdict === 'unsure' ? 'pending_review' : 'rejected';
  // Only record the verdict if the design is exactly what we checked; otherwise it must be checked again.
  const updated = await store.updateIfVersion(id, d.version, {
    status,
    moderatedHash: hash,
    rejectReason: status === 'rejected' ? EXPLICIT_REASON : null,
  });
  if (!updated) throw new Error('Your design changed while it was being checked. Please try again.');
  return resultFor(updated);
}
