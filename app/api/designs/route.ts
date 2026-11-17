import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { limit } from '@/lib/rateLimit';
import { saveDesign, type DesignInput } from '@/lib/designs';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse, readJsonObject } from '@/lib/http';

/** Creates a design, or updates one when the body carries an `id` (the caller must own it). */
export async function POST(req: Request) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    await limit('saveDesign', user.id);
    const { id, ...input } = await readJsonObject(req);
    const design = await saveDesign(supabaseDesignStore(), user.id, input as DesignInput, typeof id === 'string' ? id : undefined);
    return NextResponse.json({ id: design.id, status: design.status });
  } catch (e) {
    return errorResponse(e);
  }
}
