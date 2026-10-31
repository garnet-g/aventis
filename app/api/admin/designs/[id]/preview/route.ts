import { NextResponse } from 'next/server';
import { renderDesignPng, renderMockupPng } from '@/lib/artifacts';
import { supabaseImageLoader } from '@/lib/artifactsService';
import { requireAdmin } from '@/lib/auth';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';

/** Mockup of a design for the review queue. Admin-only: this is where customer uploads get looked at. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const design = await supabaseDesignStore().get(id);
    if (!design) return NextResponse.json({ error: 'Design not found.' }, { status: 404 });
    const item = { product: design.product, color: design.color };
    const designPng = await renderDesignPng(item, design.layers, supabaseImageLoader(design.userId, design.id));
    const mockup = await renderMockupPng(item, designPng);
    return new NextResponse(new Uint8Array(mockup), {
      headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
