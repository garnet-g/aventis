import { NextResponse } from 'next/server';
import { advanceAndNotify } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { getEmailSender, getSiteUrl } from '@/lib/notify';
import { supabaseOrderStore } from '@/lib/ordersStore';
import { getServiceClient } from '@/lib/supabase/server';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const order = await advanceAndNotify(
      {
        orders: supabaseOrderStore(),
        email: getEmailSender(),
        emailFor: async (userId) => (await getServiceClient().auth.admin.getUserById(userId)).data.user?.email ?? null,
        siteUrl: getSiteUrl(),
      },
      id,
    );
    return NextResponse.json({ status: order.status });
  } catch (e) {
    return errorResponse(e);
  }
}
