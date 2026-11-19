import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { deleteDesign } from '@/lib/designs';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';
import { limit } from '@/lib/rateLimit';

/** Deletes one of your own designs that has not been ordered (it also leaves your cart). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    await limit('saveDesign', user);
    const { id } = await params;
    await deleteDesign(supabaseDesignStore(), id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
