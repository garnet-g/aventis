import { NextResponse } from 'next/server';
import { renderDesignPng, renderMockup } from '@/lib/artifacts';
import { supabaseImageLoader } from '@/lib/artifactsService';
import { apiUser } from '@/lib/auth';
import { limit } from '@/lib/rateLimit';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';

/** A picture of the customer's own design on its garment (?side=back for the back). Nobody else can see it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    await limit('preview', user);
    const { id } = await params;
    const design = await supabaseDesignStore().get(id);
    if (!design || design.userId !== user.id) return NextResponse.json({ error: 'Design not found.' }, { status: 404 });
    const search = new URL(req.url).searchParams;
    const side = search.get('side') === 'back' ? 'back' : 'front';
    // a link carrying the design's current version can be kept: an edit gives a new link
    const cache = search.get('v') === design.version ? 'private, max-age=604800, immutable' : 'private, max-age=300';
    const item = { product: design.product, color: design.color, side } as const;
    const layers = side === 'back' ? design.backLayers : design.layers;
    const designPng = await renderDesignPng(item, layers, supabaseImageLoader(design.userId, design.id));
    const mockup = await renderMockup(item, designPng);
    return new NextResponse(new Uint8Array(mockup), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': cache },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
