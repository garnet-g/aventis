import { createHash } from 'node:crypto';
import { z } from 'zod';
import { catalog, COLORS, SIZES } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { moderateDesign } from '@/lib/moderation';
import type { ImageSafetyProvider } from '@/lib/moderation/image';

export type DesignStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

export type Design = {
  id: string;
  userId: string;
  product: keyof typeof catalog;
  color: (typeof COLORS)[number];
  size: (typeof SIZES)[number];
  layers: DesignLayer[];
  status: DesignStatus;
  rejectReason: string | null;
  /** Hash of the layers that were last moderated; lets an unchanged resubmit skip re-moderation. */
  moderatedHash: string | null;
};

export interface DesignStore {
  get(id: string): Promise<Design | null>;
  insert(userId: string, input: Pick<Design, 'product' | 'color' | 'size' | 'layers'>): Promise<Design>;
  update(id: string, patch: Partial<Omit<Design, 'id' | 'userId'>>): Promise<Design>;
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
  z.object({ kind: z.literal('image'), uploadPath: z.string().max(200), rect: rectSchema, rotation: z.number().min(-360).max(360) }),
  z.object({
    kind: z.literal('text'),
    text: z.string().min(1).max(60),
    font: z.string().max(200),
    fill: z.string().regex(/^#[0-9a-f]{6}$/i),
    direction: z.enum(['ltr', 'rtl']),
    rect: rectSchema,
    rotation: z.number().min(-360).max(360),
  }),
]);

const inputSchema = z.object({
  product: z.enum(Object.keys(catalog) as [keyof typeof catalog, ...(keyof typeof catalog)[]]),
  color: z.enum(COLORS),
  size: z.enum(SIZES),
  layers: z.array(layerSchema).max(20),
});

export type DesignInput = z.input<typeof inputSchema>;

export const layersHash = (layers: DesignLayer[]) => createHash('sha256').update(JSON.stringify(layers)).digest('hex');

const NOT_FOUND = 'Design not found.';
const EXPLICIT_REASON = 'This design appears to contain explicit content and cannot be printed.';

/** Creates or updates a design. Any save puts the design back to draft, so it must be checked again. */
export async function saveDesign(store: DesignStore, userId: string, input: DesignInput, id?: string): Promise<Design> {
  const parsed = inputSchema.parse(input);
  const layers = parsed.layers as DesignLayer[];

  if (!id) {
    // Uploads belong to an existing design, so a brand-new design cannot reference any yet.
    if (layers.some((l) => l.kind === 'image')) throw new Error('Invalid upload reference.');
    return store.insert(userId, { ...parsed, layers });
  }

  const existing = await store.get(id);
  if (!existing || existing.userId !== userId) throw new Error(NOT_FOUND);
  const prefix = `${userId}/${id}/`;
  for (const l of layers) {
    if (l.kind === 'image' && (!l.uploadPath.startsWith(prefix) || l.uploadPath.slice(prefix.length).includes('/') || l.uploadPath.includes('..'))) {
      throw new Error('Invalid upload reference.');
    }
  }
  return store.update(id, { ...parsed, layers, status: 'draft', rejectReason: null });
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
  if (d.layers.length === 0) throw new Error('Add something to print first.');

  const hash = layersHash(d.layers);
  if (d.status !== 'draft' && d.moderatedHash === hash) return resultFor(d);

  const texts = d.layers.flatMap((l) => (l.kind === 'text' ? [l.text] : []));
  const images = await Promise.all(d.layers.flatMap((l) => (l.kind === 'image' ? [store.downloadUpload(l.uploadPath)] : [])));
  const verdict = await moderateDesign({ texts, images }, provider);

  const status: DesignStatus = verdict === 'clear' ? 'approved' : verdict === 'unsure' ? 'pending_review' : 'rejected';
  const updated = await store.update(id, {
    status,
    moderatedHash: hash,
    rejectReason: status === 'rejected' ? EXPLICIT_REASON : null,
  });
  return resultFor(updated);
}
