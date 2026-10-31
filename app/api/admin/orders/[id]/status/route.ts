import { NextResponse } from 'next/server';
import { advanceOrder } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { supabaseOrderStore } from '@/lib/ordersStore';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const order = await advanceOrder(supabaseOrderStore(), id);
    return NextResponse.json({ status: order.status });
  } catch (e) {
    return errorResponse(e);
  }
}
