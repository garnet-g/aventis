import { notFound, redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

/** For API routes: the signed-in user, or null (the route then answers 401 instead of redirecting to a page). */
export async function apiUser() {
  const {
    data: { user },
  } = await (await getServerClient()).auth.getUser();
  return user;
}

/** For pages: the signed-in user, or a redirect to sign-in that comes back to `returnTo` afterwards. */
export async function requireUser(returnTo?: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login');
  return user;
}

/** The visitor, signed in or as a guest, or null when there is no session at all (never redirects). */
export async function currentUser() {
  const {
    data: { user },
  } = await (await getServerClient()).auth.getUser();
  return user;
}

/** A guest: someone designing without an account yet (Supabase anonymous sign-in). */
export const isGuest = (user: { is_anonymous?: boolean } | null | undefined) => Boolean(user?.is_anonymous);

/**
 * For pages that need a real account (paying, the account page): guests and visitors are sent to sign up or sign in,
 * then come back. A guest's designs and cart move into the account when they do.
 */
export async function requireAccount(returnTo: string) {
  const user = await currentUser();
  if (!user || isGuest(user)) redirect(`/login?next=${encodeURIComponent(returnTo)}&reason=account`);
  return user;
}

/** Non-admins get a 404 so admin routes are not discoverable. */
export async function requireAdmin() {
  const user = await requireUser();
  if (isGuest(user)) notFound();
  const { data } = await getServiceClient().from('profiles').select('is_admin').eq('id', user.id).single();
  if (!data?.is_admin) notFound();
  return user;
}
