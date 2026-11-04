import { NextResponse } from 'next/server';
import { supabaseArtifactGenerator } from '@/lib/artifactsService';
import { apiUser } from '@/lib/auth';
import { supabaseCartStore } from '@/lib/cartStore';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';
import { adminAlertRecipients, getEmailSender, getSiteUrl, notifyNewOrder } from '@/lib/notify';
import { placeCheckout } from '@/lib/orders';
import { supabasePriceStore } from '@/lib/pricesStore';
import { supabaseOrderStore } from '@/lib/ordersStore';
import { getPaymentProvider } from '@/lib/payments';
import { getServiceClient } from '@/lib/supabase/server';

/** Pays for the signed-in customer's whole cart. The body only carries delivery details: what is bought and what it costs come from the server. */
export async function POST(req: Request) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { delivery } = await req.json();
    const { orders, created } = await placeCheckout(
      {
        designs: supabaseDesignStore(),
        orders: supabaseOrderStore(),
        cart: supabaseCartStore(),
        provider: getPaymentProvider(),
        prices: supabasePriceStore(),
        artifacts: supabaseArtifactGenerator,
      },
      { userId: user.id, delivery },
    );
    if (created) await alertAdmins(orders.length, orders.reduce((sum, o) => sum + o.priceKes + o.deliveryFeeKes, 0));
    return NextResponse.json({ orderIds: orders.map((o) => o.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Emails the admins about a new paid checkout. A failed alert never affects the customer's payment. */
async function alertAdmins(orderCount: number, totalKes: number) {
  try {
    const db = getServiceClient();
    const to = await adminAlertRecipients(process.env.ADMIN_ALERT_EMAILS, async () => {
      const { data } = await db.from('profiles').select('id').eq('is_admin', true);
      const emails = await Promise.all((data ?? []).map(async (p) => (await db.auth.admin.getUserById(p.id as string)).data.user?.email ?? null));
      return emails.filter((e): e is string => Boolean(e));
    });
    if (to.length) await notifyNewOrder(getEmailSender(), getSiteUrl(), { to, orderCount, totalKes });
  } catch (e) {
    console.error('could not alert the admins about a new order', e);
  }
}
