import { NextResponse } from 'next/server';
import { saveOrderNote } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { supabaseOrderNoteStore } from '@/lib/orderNotesStore';
import { supabaseOrderStore } from '@/lib/ordersStore';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  try {
    const { id } = await params;
    const { note } = await req.json().catch(() => ({}));
    const saved = await saveOrderNote({ orders: supabaseOrderStore(), notes: supabaseOrderNoteStore() }, id, note);
    return NextResponse.json({ note: saved });
  } catch (e) {
    return errorResponse(e);
  }
}
