import { NextResponse } from 'next/server';
import { supabaseArtifactGenerator } from '@/lib/artifactsService';
import { apiUser } from '@/lib/auth';
import { supabaseCartStore } from '@/lib/cartStore';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';
import { placeCheckout } from '@/lib/orders';
import { supabaseOrderStore } from '@/lib/ordersStore';
import { getPaymentProvider } from '@/lib/payments';

/** Pays for the signed-in customer's whole cart. The body only carries delivery details: what is bought and what it costs come from the server. */
export async function POST(req: Request) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { delivery } = await req.json();
    const { orders } = await placeCheckout(
      {
        designs: supabaseDesignStore(),
        orders: supabaseOrderStore(),
        cart: supabaseCartStore(),
        provider: getPaymentProvider(),
        artifacts: supabaseArtifactGenerator,
      },
      { userId: user.id, delivery },
    );
    return NextResponse.json({ orderIds: orders.map((o) => o.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
