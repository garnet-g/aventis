import { NextResponse } from 'next/server';
import { cancelAndNotify } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { errorResponse, readJsonObject } from '@/lib/http';
import { getEmailSender, getSiteUrl } from '@/lib/notify';
import { supabaseOrderStore } from '@/lib/ordersStore';
import { emailForUser } from '@/lib/paymentService';
import { getSmsSender } from '@/lib/sms';

/** Cancels an order that hasn't shipped: { reason }. The customer is told by email and SMS. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const { reason } = await readJsonObject(req);
    const order = await cancelAndNotify({ orders: supabaseOrderStore(), email: getEmailSender(), emailFor: emailForUser, siteUrl: getSiteUrl(), sms: getSmsSender() }, id, reason);
    return NextResponse.json({ status: order.status });
  } catch (e) {
    return errorResponse(e);
  }
}
