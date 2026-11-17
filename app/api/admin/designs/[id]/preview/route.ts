import { NextResponse } from 'next/server';
import { renderDesignPng, renderMockup } from '@/lib/artifacts';
import { supabaseImageLoader } from '@/lib/artifactsService';
import { requireAdmin } from '@/lib/auth';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';

/** Mockup of a design for the review queue. Admin-only: this is where customer uploads get looked at. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const design = await supabaseDesignStore().get(id);
    if (!design) return NextResponse.json({ error: 'Design not found.' }, { status: 404 });
    const search = new URL(req.url).searchParams;
    const side = search.get('side') === 'back' ? 'back' : 'front';
    // a link carrying the design's current version can be kept by the browser: a change gives a new link
    const cache = search.get('v') === design.version ? 'private, max-age=604800, immutable' : 'private, no-store';
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
