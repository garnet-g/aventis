import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { safeNextPath } from '@/lib/authFlow';
import { getServerClient } from '@/lib/supabase/server';

const EMAIL_TYPES: EmailOtpType[] = ['signup', 'recovery', 'invite', 'magiclink', 'email', 'email_change'];

/**
 * Where links in sign-up and password-reset emails land. Signs the person in from the link, then sends them on to
 * `next` (only ever a path on this site). A used or expired link goes back to sign-in with an explanation.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNextPath(url.searchParams.get('next')) ?? '/design';
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = EMAIL_TYPES.find((t) => t === url.searchParams.get('type'));
  const supabase = await getServerClient();

  // Default links carry a one-time code (PKCE); custom email templates may send a token hash instead.
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('missing code') };

  if (error) {
    const back = next === '/reset-password' ? '/login?mode=reset&error=link' : '/login?error=link';
    return NextResponse.redirect(new URL(back, url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
