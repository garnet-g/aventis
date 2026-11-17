import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { limit } from '@/lib/rateLimit';
import { getServiceClient } from '@/lib/supabase/server';

/** Everything we hold about the signed-in customer, as a JSON file (their right of access under the Data Protection Act). */
export async function GET() {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    await limit('account', user.id);
    const db = getServiceClient();
    const [designs, orders, payments, cart] = await Promise.all([
      db.from('designs').select('id, product, color, size, layers, back_layers, status, reject_reason, created_at, updated_at').eq('user_id', user.id),
      db.from('orders').select('id, design_id, status, quantity, price_kes, delivery_fee_kes, name, phone, address, city, county, payment_ref, courier, tracking, cancel_reason, refunded_kes, refund_ref, created_at').eq('user_id', user.id),
      db.from('payments').select('id, status, amount_kes, phone, provider_ref, failure_reason, refund_ref, created_at').eq('user_id', user.id),
      db.from('cart_items').select('design_id, quantity').eq('user_id', user.id),
    ]);
    const body = {
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, createdAt: user.created_at, lastSignIn: user.last_sign_in_at },
      designs: designs.data ?? [],
      orders: orders.data ?? [],
      payments: payments.data ?? [],
      cart: cart.data ?? [],
      note: 'Uploaded pictures are referenced by path in each design. Ask us by email if you want copies of the files.',
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="vybecrew-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
