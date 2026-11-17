import { NextResponse } from 'next/server';
import { removeAdmin } from '@/lib/admins';
import { supabaseAdminDirectory } from '@/lib/adminsStore';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';

/** Takes admin rights away (never your own). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  try {
    const { id } = await params;
    await removeAdmin(supabaseAdminDirectory(), me.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
