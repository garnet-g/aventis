import { NextResponse } from 'next/server';
import { regenerateArtifacts } from '@/lib/admin';
import { supabaseArtifactGenerator } from '@/lib/artifactsService';
import { requireAdmin } from '@/lib/auth';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';
import { supabaseOrderStore } from '@/lib/ordersStore';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    await regenerateArtifacts(
      { orders: supabaseOrderStore(), designs: supabaseDesignStore(), artifacts: supabaseArtifactGenerator },
      id,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
