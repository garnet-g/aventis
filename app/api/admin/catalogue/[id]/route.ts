import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { editCatalogueItem } from '@/lib/catalogueItems';
import { renderCataloguePreview, supabaseCatalogueStore } from '@/lib/catalogueStore';
import { HttpError } from '@/lib/errors';
import { errorResponse, readJsonObject } from '@/lib/http';

/** Edits a design: { title?, description?, colors?, featured?, published? }. New colours get their previews drawn. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const body = await readJsonObject(req);
    if (!Object.keys(body).length) throw new HttpError(400, 'Nothing to change.');
    const item = await editCatalogueItem({ store: supabaseCatalogueStore(), renderPreview: renderCataloguePreview }, id, body);
    return NextResponse.json({ published: item.published, featured: item.featured ?? false });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Removes a design and its pictures. Orders already placed keep their own copy. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    await supabaseCatalogueStore().remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
