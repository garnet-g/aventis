import { after, NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { startCheckout } from '@/lib/checkout';
import { HttpError } from '@/lib/errors';
import { errorResponse, readJsonObject } from '@/lib/http';
import { afterOrdersPaid, checkoutDeps } from '@/lib/paymentService';
import { limit, rateLimit } from '@/lib/rateLimit';

/**
 * Starts paying for the signed-in customer's whole cart. The body only carries delivery details, the M-Pesa number
 * and the terms checkbox: what is bought and what it costs are worked out on the server.
 * Answers { status: 'paid', paymentId, orderIds } (test mode) or { status: 'pending', paymentId, message } (M-Pesa:
 * the customer approves on their phone and the page then asks /api/payments/[id]).
 */
export async function POST(req: Request) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    await limit('pay', user.id);
    const { delivery, mpesaPhone, acceptTerms } = await readJsonObject(req);
    if (acceptTerms !== true) throw new HttpError(400, 'Please accept the terms and confirm you own the rights to your designs.');
    // Prompts go to a phone that must approve them with its PIN, but nobody should be able to pester a number with
    // M-Pesa requests. Only prompts actually sent count: per account and number, and (more loosely) per number across
    // all accounts, so other people can't easily use up the owner's own allowance.
    const beforePrompt = async (phone: string) => {
      await rateLimit(`prompt:${user.id}:${phone}`, 5, 10 * 60);
      await rateLimit(`prompt:${phone}`, 20, 10 * 60);
    };
    const result = await startCheckout({ ...checkoutDeps(), beforePrompt }, { userId: user.id, delivery, mpesaPhone: typeof mpesaPhone === 'string' ? mpesaPhone : undefined });
    if (result.status === 'pending') {
      return NextResponse.json({ status: 'pending', paymentId: result.payment.id, message: result.message });
    }
    if (result.created) after(() => afterOrdersPaid(result.payment, result.orders));
    return NextResponse.json({ status: 'paid', paymentId: result.payment?.id ?? null, orderIds: result.orders.map((o) => o.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
