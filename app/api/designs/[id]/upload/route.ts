import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { declaredSizeTooLarge, MAX_UPLOAD_BYTES, normalizeUpload } from '@/lib/upload';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const { id } = await params;

  // Row-level security makes this return nothing unless the design is the caller's own.
  const { data: design } = await (await getServerClient()).from('designs').select('id').eq('id', id).single();
  if (!design) return NextResponse.json({ error: 'Design not found.' }, { status: 404 });

  if (declaredSizeTooLarge(req.headers.get('content-length'))) {
    return NextResponse.json({ error: 'The image is larger than 10 MB.' }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file was sent.' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'The image is larger than 10 MB.' }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const checked = await normalizeUpload(bytes);
  if (!checked.ok) return NextResponse.json({ error: checked.reason }, { status: 400 });

  const path = `${user.id}/${id}/${randomUUID()}.${checked.ext}`;
  const { error } = await getServiceClient().storage.from('uploads').upload(path, checked.buffer, { contentType: checked.mime });
  if (error) return NextResponse.json({ error: 'Upload failed, please try again.' }, { status: 500 });

  return NextResponse.json({ path, widthPx: checked.widthPx, heightPx: checked.heightPx });
}
