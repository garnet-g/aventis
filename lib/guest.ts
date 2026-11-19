'use client';

import { getBrowserClient } from '@/lib/supabase/client';

/** Where a guest session is remembered while its owner signs up or signs in, so their designs can follow them. */
const GUEST_KEY = 'vibecrew-guest';

const read = () => {
  try {
    return localStorage.getItem(GUEST_KEY);
  } catch {
    return null;
  }
};
const write = (v: string | null) => {
  try {
    if (v) localStorage.setItem(GUEST_KEY, v);
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    // private window or blocked storage: the designs then stay with the guest session
  }
};

/** Makes sure there is a session, starting a guest one (no form to fill) when there is none. Returns false if it could not. */
export async function ensureSession(): Promise<boolean> {
  const supabase = getBrowserClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  const { error } = await supabase.auth.signInAnonymously();
  return !error;
}

/** Call before signing up or signing in: remembers the guest session (if this is one) to bring its designs over. */
export async function rememberGuest() {
  const { data } = await getBrowserClient().auth.getSession();
  if (data.session?.user.is_anonymous) write(data.session.refresh_token);
}

let inFlight: Promise<boolean> | null = null;

/** Call once signed in to a real account: moves the remembered guest's designs and cart into it. True if anything moved. */
export function claimGuest(): Promise<boolean> {
  // the login page and the header can both ask at once: one request does the moving
  inFlight ??= runClaim().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runClaim(): Promise<boolean> {
  const refreshToken = read();
  if (!refreshToken) return false;
  const { data } = await getBrowserClient().auth.getUser();
  if (!data.user || data.user.is_anonymous) return false;
  try {
    const res = await fetch('/api/account/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
    if (res.status === 401 || res.status >= 500) return false; // try again later
    write(null);
    const body = (await res.json().catch(() => ({}))) as { moved?: number };
    return (body.moved ?? 0) > 0;
  } catch {
    return false;
  }
}
