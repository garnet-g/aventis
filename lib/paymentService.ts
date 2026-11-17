import { supabaseArtifactGenerator } from '@/lib/artifactsService';
import { generateOrderFiles, type PaymentRecord } from '@/lib/checkout';
import { supabaseCartStore } from '@/lib/cartStore';
import { supabaseDesignStore } from '@/lib/designsStore';
import { adminAlertRecipients, getEmailSender, getSiteUrl, notifyNewOrder, notifyOrderPaid, notifyRefundNeeded } from '@/lib/notify';
import type { Order } from '@/lib/orders';
import { supabaseOrderStore } from '@/lib/ordersStore';
import { getPaymentProvider } from '@/lib/payments';
import { supabasePaymentStore } from '@/lib/paymentsStore';
import { supabasePriceStore } from '@/lib/pricesStore';
import { getSmsSender, sendSmsSafely, smsText } from '@/lib/sms';
import { getServiceClient } from '@/lib/supabase/server';

/** Everything the checkout steps need, wired to Supabase and the configured payment provider. */
export function checkoutDeps() {
  return {
    designs: supabaseDesignStore(),
    orders: supabaseOrderStore(),
    cart: supabaseCartStore(),
    provider: getPaymentProvider(),
    payments: supabasePaymentStore(),
    prices: supabasePriceStore(),
  };
}

export async function emailForUser(userId: string): Promise<string | null> {
  const { data } = await getServiceClient().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

async function adminEmails() {
  const db = getServiceClient();
  return adminAlertRecipients(process.env.ADMIN_ALERT_EMAILS, async () => {
    const { data } = await db.from('profiles').select('id').eq('is_admin', true);
    const emails = await Promise.all((data ?? []).map((p) => emailForUser(p.id as string)));
    return emails.filter((e): e is string => Boolean(e));
  });
}

/**
 * Runs once, right after new orders are created (call it inside `after()`, so the customer isn't kept waiting):
 * draws the printer's files, sends the customer a receipt by email and SMS, and alerts the admins. None of these can
 * undo the payment; each failure is logged.
 */
export async function afterOrdersPaid(payment: PaymentRecord | null, orders: Order[]) {
  if (!orders.length) return;
  const siteUrl = getSiteUrl();
  const totalKes = orders.reduce((sum, o) => sum + o.priceKes + o.deliveryFeeKes, 0);
  const receipt = payment?.providerRef ?? orders[0].paymentRef;
  await generateOrderFiles({ designs: supabaseDesignStore(), orders: supabaseOrderStore(), artifacts: supabaseArtifactGenerator }, orders).catch((e) =>
    console.error('could not draw files for new orders', e),
  );
  try {
    const to = await emailForUser(orders[0].userId);
    if (to && payment) await notifyOrderPaid(getEmailSender(), siteUrl, { to, orderCount: orders.length, totalKes, receipt, paymentId: payment.id });
  } catch (e) {
    console.error('could not email the receipt', e);
  }
  await sendSmsSafely(getSmsSender(), orders[0].delivery.phone, smsText.paid({ totalKes, receipt, orderIds: orders.map((o) => o.id), siteUrl }));
  try {
    const to = await adminEmails();
    if (to.length) await notifyNewOrder(getEmailSender(), siteUrl, { to, orderCount: orders.length, totalKes });
  } catch (e) {
    console.error('could not alert the admins about a new order', e);
  }
}

/** A paid payment that could not become orders: the admins must refund it. */
export async function afterRefundNeeded(payment: PaymentRecord) {
  try {
    const to = await adminEmails();
    if (to.length) {
      await notifyRefundNeeded(getEmailSender(), getSiteUrl(), {
        to,
        amountKes: payment.amountKes,
        receipt: payment.providerRef ?? payment.requestId ?? payment.id,
        reason: payment.failureReason ?? 'A design changed while the customer was paying.',
      });
    }
  } catch (e) {
    console.error('could not alert the admins about a refund', e);
  }
}
