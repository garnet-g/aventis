import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { limit } from '@/lib/rateLimit';
import { removeFromCart, setCartQuantity } from '@/lib/cart';
import { supabaseCartStore } from '@/lib/cartStore';
import { errorResponse, readJsonObject } from '@/lib/http';

export async function PUT(req: Request, { params }: { params: Promise<{ designId: string }> }) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    await limit('cart', user);
    const { designId } = await params;
    const { quantity } = await readJsonObject(req);
    await setCartQuantity({ cart: supabaseCartStore() }, user.id, designId, quantity as number);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ designId: string }> }) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    await limit('cart', user);
    const { designId } = await params;
    await removeFromCart({ cart: supabaseCartStore() }, user.id, designId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
