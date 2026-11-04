import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createCatalogueItem, type ArtFile } from '@/lib/catalogueItems';
import { renderCataloguePreview, saveCatalogueArt, supabaseCatalogueStore } from '@/lib/catalogueStore';
import { HttpError } from '@/lib/errors';
import { errorResponse } from '@/lib/http';
import { MAX_UPLOAD_BYTES, normalizeUpload } from '@/lib/upload';

async function readArt(form: FormData, name: string): Promise<ArtFile | undefined> {
  const file = form.get(name);
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'A picture is larger than 10 MB.');
  const checked = await normalizeUpload(Buffer.from(await file.arrayBuffer()));
  if (!checked.ok) throw new HttpError(400, checked.reason);
  return checked;
}

/** Posts a new catalogue design: title, product, colours and a picture for the front and/or the back. */
export async function POST(req: Request) {
  await requireAdmin();
  try {
    const form = await req.formData().catch(() => null);
    if (!form) throw new HttpError(400, 'The form could not be read.');
    const item = await createCatalogueItem(
      { store: supabaseCatalogueStore(), saveArt: saveCatalogueArt, renderPreview: renderCataloguePreview },
      {
        fields: { title: form.get('title'), description: form.get('description') ?? '', product: form.get('product'), colors: form.getAll('colors') },
        front: await readArt(form, 'front'),
        back: await readArt(form, 'back'),
      },
    );
    return NextResponse.json({ id: item.id });
  } catch (e) {
    return errorResponse(e);
  }
}
