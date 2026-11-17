import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { HttpError } from '@/lib/errors';
import { errorResponse, readJsonObject } from '@/lib/http';
import { supabasePaymentStore } from '@/lib/paymentsStore';

/** Marks a payment that needed a refund as refunded: { ref } (the M-Pesa reference of the refund). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const { ref } = await readJsonObject(req);
    const clean = typeof ref === 'string' ? ref.trim().slice(0, 40) : '';
    if (clean.length < 4) throw new HttpError(400, 'Enter the M-Pesa reference of the refund.');
    const updated = await supabasePaymentStore().transition(id, ['needs_refund'], 'refunded', { refundRef: clean });
    if (!updated) throw new HttpError(409, 'This payment is not waiting for a refund.');
    return NextResponse.json({ status: updated.status });
  } catch (e) {
    return errorResponse(e);
  }
}
