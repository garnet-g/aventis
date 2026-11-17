import { NextResponse } from 'next/server';
import { moveOrderBack } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { supabaseOrderStore } from '@/lib/ordersStore';

/** Moves an order one step back (an admin clicked too far). The customer is not messaged. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    return NextResponse.json({ status: (await moveOrderBack(supabaseOrderStore(), id)).status });
  } catch (e) {
    return errorResponse(e);
  }
}
