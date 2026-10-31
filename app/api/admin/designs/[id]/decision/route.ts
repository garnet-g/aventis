import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decideDesign } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';

const body = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().max(300).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); // non-admins get a 404 before anything else happens
  try {
    const { id } = await params;
    const { decision, reason } = body.parse(await req.json());
    const design = await decideDesign({ designs: supabaseDesignStore() }, id, decision, reason);
    return NextResponse.json({ status: design.status });
  } catch (e) {
    return errorResponse(e);
  }
}
