import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { supabaseCartStore } from '@/lib/cartStore';
import { orderFromCatalogue } from '@/lib/catalogueItems';
import { copyCatalogueArtToUploads, supabaseCatalogueStore } from '@/lib/catalogueStore';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';

/** Copies a catalogue design for the signed-in customer: into their cart, or as a draft to customise. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { design, inCart } = await orderFromCatalogue(
      { items: supabaseCatalogueStore(), designs: supabaseDesignStore(), cart: supabaseCartStore(), copyArt: copyCatalogueArtToUploads },
      user.id,
      id,
      body,
    );
    return NextResponse.json({ designId: design.id, inCart });
  } catch (e) {
    return errorResponse(e);
  }
}
