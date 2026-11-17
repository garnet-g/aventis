import { NextResponse } from 'next/server';
import { deleteAccount } from '@/lib/account';
import { supabaseAccountStore } from '@/lib/accountStore';
import { apiUser } from '@/lib/auth';
import { errorResponse, readJsonObject } from '@/lib/http';
import { limit } from '@/lib/rateLimit';

/** Deletes (or, with past orders, closes) the signed-in customer's account: { confirm: "DELETE" }. */
export async function DELETE(req: Request) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    await limit('account', user.id);
    const { confirm } = await readJsonObject(req);
    const result = await deleteAccount(supabaseAccountStore(), user.id, confirm);
    return NextResponse.json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
