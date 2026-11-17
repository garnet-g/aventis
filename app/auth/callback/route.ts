import { NextResponse } from 'next/server';
import { safeNextPath } from '@/lib/authFlow';
import { getServerClient } from '@/lib/supabase/server';

/**
 * Where links in sign-up and password-reset emails land. Signs the person in from the link, then sends them on to
 * `next` (only ever a path on this site). A used or expired link goes back to sign-in with an explanation.
 *
 * Only the one-time `code` (PKCE) is accepted. Its secret half was stored in a cookie by the browser that asked for
 * the email, so a link only works in that browser: nobody can send someone a link that signs them into another
 * account. (Token-hash links don't have that protection, so they are deliberately not supported.)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNextPath(url.searchParams.get('next')) ?? '/design';
  const code = url.searchParams.get('code');

  const { error } = code ? await (await getServerClient()).auth.exchangeCodeForSession(code) : { error: new Error('missing code') };

  if (error) {
    const back = next === '/reset-password' ? '/login?mode=reset&error=link' : '/login?error=link';
    return NextResponse.redirect(new URL(back, url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
