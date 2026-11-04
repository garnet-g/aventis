import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { addToCart } from '@/lib/cart';
import { supabaseCartStore } from '@/lib/cartStore';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';

/** Puts an approved design in the signed-in customer's cart (a no-op if it is already there). */
export async function POST(req: Request) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { designId } = await req.json();
    await addToCart({ designs: supabaseDesignStore(), cart: supabaseCartStore() }, user.id, String(designId));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
