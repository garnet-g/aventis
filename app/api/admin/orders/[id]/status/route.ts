import { NextResponse } from 'next/server';
import { advanceAndNotify, advanceGroupAndNotify } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { getEmailSender, getSiteUrl } from '@/lib/notify';
import { supabaseOrderStore } from '@/lib/ordersStore';
import { emailForUser } from '@/lib/paymentService';
import { getSmsSender } from '@/lib/sms';

/**
 * Moves an order one step forward. When it ships, the body may carry { courier, tracking } for the customer's SMS.
 * { together: true } moves every order paid with it (at the same step) as one, with one message to the customer.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { courier?: unknown; tracking?: unknown; together?: unknown };
    const deps = { orders: supabaseOrderStore(), email: getEmailSender(), emailFor: emailForUser, siteUrl: getSiteUrl(), sms: getSmsSender() };
    const shipping = { courier: typeof body.courier === 'string' ? body.courier : undefined, tracking: typeof body.tracking === 'string' ? body.tracking : undefined };
    if (body.together === true) {
      const moved = await advanceGroupAndNotify(deps, id, shipping);
      return NextResponse.json({ status: moved[0].status, moved: moved.length });
    }
    const order = await advanceAndNotify(deps, id, shipping);
    return NextResponse.json({ status: order.status });
  } catch (e) {
    return errorResponse(e);
  }
}
