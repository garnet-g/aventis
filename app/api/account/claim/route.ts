import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { apiUser, isGuest } from '@/lib/auth';
import { errorResponse, readJsonObject } from '@/lib/http';
import { moveGuestToAccount } from '@/lib/guestClaimStore';
import { limit } from '@/lib/rateLimit';

/**
 * After a guest signs up or signs in: { refreshToken } of the guest session proves the guest was this browser's.
 * Its designs and cart move into the signed-in account.
 */
export async function POST(req: Request) {
  try {
    const user = await apiUser();
    if (!user || isGuest(user)) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    await limit('account', user.id);
    const { refreshToken } = await readJsonObject(req);
    if (typeof refreshToken !== 'string' || refreshToken.length < 8 || refreshToken.length > 512) {
      return NextResponse.json({ error: 'Nothing to bring over.' }, { status: 400 });
    }
    // Only the guest's own session can name the guest: exchanging its refresh token tells us who it is.
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.refreshSession({ refresh_token: refreshToken });
    const guest = data.user;
    if (error || !guest) return NextResponse.json({ error: 'That guest session has ended.' }, { status: 410 });
    if (!isGuest(guest) || guest.id === user.id) return NextResponse.json({ moved: 0 });
    const { designs } = await moveGuestToAccount(guest.id, user.id);
    return NextResponse.json({ moved: designs });
  } catch (e) {
    return errorResponse(e);
  }
}
