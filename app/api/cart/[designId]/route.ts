import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { removeFromCart, setCartQuantity } from '@/lib/cart';
import { supabaseCartStore } from '@/lib/cartStore';
import { errorResponse } from '@/lib/http';

export async function PUT(req: Request, { params }: { params: Promise<{ designId: string }> }) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { designId } = await params;
    const { quantity } = await req.json();
    await setCartQuantity({ cart: supabaseCartStore() }, user.id, designId, quantity);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ designId: string }> }) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { designId } = await params;
    await removeFromCart({ cart: supabaseCartStore() }, user.id, designId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
