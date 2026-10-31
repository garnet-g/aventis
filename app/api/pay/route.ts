import { NextResponse } from 'next/server';
import { supabaseArtifactGenerator } from '@/lib/artifactsService';
import { requireUser } from '@/lib/auth';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';
import { createPaidOrder } from '@/lib/orders';
import { supabaseOrderStore } from '@/lib/ordersStore';
import { getPaymentProvider } from '@/lib/payments';

/** The amount is computed on the server from the catalog; the body only names the design and delivery details. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { designId, delivery } = await req.json();
    const order = await createPaidOrder(
      {
        designs: supabaseDesignStore(),
        orders: supabaseOrderStore(),
        provider: getPaymentProvider(),
        artifacts: supabaseArtifactGenerator,
      },
      { designId: String(designId), userId: user.id, delivery },
    );
    return NextResponse.json({ orderId: order.id });
  } catch (e) {
    return errorResponse(e);
  }
}
