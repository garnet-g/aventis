import { NextResponse } from 'next/server';
import { artifactPath, signedDownloadUrl, type ArtifactFile } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { supabaseOrderStore } from '@/lib/ordersStore';
import { getServiceClient } from '@/lib/supabase/server';

/** GET ?file=mockup|design|back-mockup|back-design: redirects to a 60-second signed link. The bucket itself stays private. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const file = new URL(req.url).searchParams.get('file');
    if (!file || !['mockup', 'design', 'back-mockup', 'back-design'].includes(file)) {
      return NextResponse.json({ error: 'Unknown file.' }, { status: 400 });
    }
    const order = await supabaseOrderStore().findById(id);
    const path = order ? artifactPath(order, file as ArtifactFile) : null;
    if (!order || !path) return NextResponse.json({ error: 'File not found.' }, { status: 404 });

    const bucket = getServiceClient().storage.from('artifacts');
    const url = await signedDownloadUrl(
      {
        createSignedUrl: async (p, seconds) => {
          const { data, error } = await bucket.createSignedUrl(p, seconds, { download: `${order.id}-${file}.png` });
          if (error || !data) throw new Error('Could not create the download link.');
          return data.signedUrl;
        },
      },
      path,
    );
    return NextResponse.redirect(url, 302);
  } catch (e) {
    return errorResponse(e);
  }
}
