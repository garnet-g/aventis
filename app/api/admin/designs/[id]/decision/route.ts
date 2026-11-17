import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decideAndNotify } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse, readJsonObject } from '@/lib/http';
import { getEmailSender, getSiteUrl } from '@/lib/notify';
import { getServiceClient } from '@/lib/supabase/server';

const body = z.object({
  decision: z.enum(['approve', 'reject'], { message: 'Choose approve or reject.' }),
  reason: z.string().max(300, 'Keep the reason under 300 characters.').optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); // non-admins get a 404 before anything else happens
  try {
    const { id } = await params;
    const { decision, reason } = body.parse(await readJsonObject(req));
    const design = await decideAndNotify(
      {
        designs: supabaseDesignStore(),
        email: getEmailSender(),
        emailFor: async (userId) => (await getServiceClient().auth.admin.getUserById(userId)).data.user?.email ?? null,
        siteUrl: getSiteUrl(),
      },
      id,
      decision,
      reason,
    );
    return NextResponse.json({ status: design.status });
  } catch (e) {
    return errorResponse(e);
  }
}
