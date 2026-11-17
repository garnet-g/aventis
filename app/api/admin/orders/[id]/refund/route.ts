import { NextResponse } from 'next/server';
import { recordRefund } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { errorResponse, readJsonObject } from '@/lib/http';
import { supabaseOrderStore } from '@/lib/ordersStore';

/** Records a refund sent through M-Pesa: { kes, ref }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const { kes, ref } = await readJsonObject(req);
    const order = await recordRefund(supabaseOrderStore(), id, { kes, ref });
    return NextResponse.json({ refundedKes: order.refundedKes, refundRef: order.refundRef });
  } catch (e) {
    return errorResponse(e);
  }
}
