import { NextResponse } from 'next/server';
import { addAdmin } from '@/lib/admins';
import { supabaseAdminDirectory } from '@/lib/adminsStore';
import { requireAdmin } from '@/lib/auth';
import { errorResponse, readJsonObject } from '@/lib/http';

/** Gives an existing account admin rights: { email }. */
export async function POST(req: Request) {
  await requireAdmin();
  try {
    const { email } = await readJsonObject(req);
    const id = await addAdmin(supabaseAdminDirectory(), email);
    return NextResponse.json({ id });
  } catch (e) {
    return errorResponse(e);
  }
}
