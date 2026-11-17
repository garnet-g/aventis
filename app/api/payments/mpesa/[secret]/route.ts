import { after, NextResponse } from 'next/server';
import { finalizePayment } from '@/lib/checkout';
import { afterOrdersPaid, afterRefundNeeded, checkoutDeps } from '@/lib/paymentService';
import { describeResult, parseStkCallback } from '@/lib/payments/mpesa';

const ACK = () => NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });

/**
 * Safaricom calls this when the customer approves or declines the M-Pesa prompt. The URL carries a secret
 * (MPESA_CALLBACK_SECRET) so it can't be guessed, and a success is confirmed with Daraja's own status check before
 * anything is created, because callbacks are not signed. Always answers "Accepted" so Safaricom doesn't retry.
 */
export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!process.env.MPESA_CALLBACK_SECRET || secret !== process.env.MPESA_CALLBACK_SECRET) return new NextResponse(null, { status: 404 });
  const cb = parseStkCallback(await req.json().catch(() => null));
  if (!cb) return ACK();

  const deps = checkoutDeps();
  const payment = await deps.payments.findByRequestId(cb.requestId);
  if (!payment) return ACK();

  if (cb.resultCode !== '0') {
    await deps.payments.transition(payment.id, ['pending', 'expired'], 'failed', { failureReason: describeResult(cb.resultCode, cb.resultDesc) });
    return ACK();
  }
  // Don't trust the callback on its own: ask Daraja whether this request really succeeded.
  const confirmed = await deps.provider.check(cb.requestId);
  if (confirmed.status !== 'paid') {
    console.error('M-Pesa callback said paid but the status check did not confirm it', cb.requestId, confirmed);
    return ACK();
  }
  const done = await finalizePayment(deps, payment.id, { providerRef: cb.receipt ?? `MPESA-${cb.requestId}`, amountKes: cb.amountKes });
  if (done.status === 'paid' && done.created) after(() => afterOrdersPaid(done.payment, done.orders));
  if (done.status === 'needs_refund' && done.flagged && done.payment) {
    const flagged = done.payment;
    after(() => afterRefundNeeded(flagged));
  }
  return ACK();
}
