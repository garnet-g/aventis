import { after, NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { limit } from '@/lib/rateLimit';
import { paymentStatus } from '@/lib/checkout';
import { errorResponse } from '@/lib/http';
import { afterOrdersPaid, afterRefundNeeded, checkoutDeps } from '@/lib/paymentService';

/** The waiting page asks this every few seconds: { status, reason?, orderIds }. It also checks with M-Pesa when the callback is late. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    await limit('paymentStatus', user.id);
    const { id } = await params;
    const deps = checkoutDeps();
    const s = await paymentStatus(deps, id, user.id);
    if (s.created) {
      const payment = await deps.payments.get(id);
      after(() => afterOrdersPaid(payment, s.orders));
    }
    if (s.flagged) {
      const payment = await deps.payments.get(id);
      if (payment) after(() => afterRefundNeeded(payment));
    }
    return NextResponse.json({ status: s.status, reason: s.reason ?? null, orderIds: s.orderIds });
  } catch (e) {
    return errorResponse(e);
  }
}
