import { notFound, redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

/** For API routes: the signed-in user, or null (the route then answers 401 instead of redirecting to a page). */
export async function apiUser() {
  const {
    data: { user },
  } = await (await getServerClient()).auth.getUser();
  return user;
}

export async function requireUser() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user;
}

/** Non-admins get a 404 so admin routes are not discoverable. */
export async function requireAdmin() {
  const user = await requireUser();
  const { data } = await getServiceClient().from('profiles').select('is_admin').eq('id', user.id).single();
  if (!data?.is_admin) notFound();
  return user;
}
