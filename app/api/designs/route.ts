import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { saveDesign } from '@/lib/designs';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';

/** Creates a design, or updates one when the body carries an `id` (the caller must own it). */
export async function POST(req: Request) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { id, ...input } = await req.json();
    const design = await saveDesign(supabaseDesignStore(), user.id, input, typeof id === 'string' ? id : undefined);
    return NextResponse.json({ id: design.id, status: design.status });
  } catch (e) {
    return errorResponse(e);
  }
}
