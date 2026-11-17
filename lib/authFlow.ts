import { OFFLINE_MESSAGE } from '@/lib/clientFetch';

/** What a Supabase auth error looks like to us (AuthError and its subclasses all have these fields). */
type AuthErrorLike = { code?: string; status?: number; message?: string; name?: string };

/** Supabase's own wording ("User already registered") is shown as a plain sentence with the next step. */
export function authErrorMessage(error: AuthErrorLike): string {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return OFFLINE_MESSAGE;
  switch (error.code) {
    case 'invalid_credentials':
      return "That email and password don't match. Try again, or use \"Forgot password?\" to set a new one.";
    case 'user_already_exists':
    case 'email_exists':
      return 'There is already an account with this email. Sign in instead, or reset your password.';
    case 'email_not_confirmed':
      return 'Confirm your email first: open the link we sent to your inbox.';
    case 'weak_password':
      return 'Choose a stronger password: at least 8 characters.';
    case 'same_password':
      return 'Choose a password you have not used here before.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute and try again.';
    case 'email_address_invalid':
      return 'Enter a valid email address.';
    case 'signup_disabled':
      return 'New accounts are closed right now. Please try again later.';
  }
  if (error.status === 429) return 'Too many attempts. Wait a minute and try again.';
  return 'Something went wrong. Please try again.';
}

/**
 * Where to send someone after signing in. Only paths on this site are allowed ("/cart", "/catalogue/abc"), never
 * another site ("https://evil.example", "//evil.example") or anything odd, so the link can't be used to redirect away.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.length > 300) return null;
  return /^\/[A-Za-z0-9\-._~/?=&%]*$/.test(raw) ? raw : null;
}
