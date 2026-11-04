import { NextResponse } from 'next/server';
import { renderDesignPng, renderMockupPng } from '@/lib/artifacts';
import { supabaseImageLoader } from '@/lib/artifactsService';
import { apiUser } from '@/lib/auth';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';

/** A picture of the customer's own design on its garment (?side=back for the back). Nobody else can see it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { id } = await params;
    const design = await supabaseDesignStore().get(id);
    if (!design || design.userId !== user.id) return NextResponse.json({ error: 'Design not found.' }, { status: 404 });
    const side = new URL(req.url).searchParams.get('side') === 'back' ? 'back' : 'front';
    const item = { product: design.product, color: design.color, side } as const;
    const layers = side === 'back' ? design.backLayers : design.layers;
    const designPng = await renderDesignPng(item, layers, supabaseImageLoader(design.userId, design.id));
    const mockup = await renderMockupPng(item, designPng);
    return new NextResponse(new Uint8Array(mockup), {
      headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=300' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
