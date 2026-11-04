import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseCatalogueStore } from '@/lib/catalogueStore';
import { HttpError } from '@/lib/errors';
import { errorResponse } from '@/lib/http';

/** Publishes or hides a design. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const { published } = await req.json().catch(() => ({}));
    if (typeof published !== 'boolean') throw new HttpError(400, 'Say whether the design is published.');
    const item = await supabaseCatalogueStore().update(id, { published });
    if (!item) throw new HttpError(404, 'Design not found.');
    return NextResponse.json({ published: item.published });
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
