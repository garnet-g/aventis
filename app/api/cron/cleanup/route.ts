import { NextResponse } from 'next/server';
import { cronAuthorized, GUEST_IDLE_DAYS, staleBefore } from '@/lib/cleanup';
import { getServiceClient } from '@/lib/supabase/server';

/**
 * Daily housekeeping, called by the server's cron with "Authorization: Bearer $CRON_SECRET":
 * deletes drafts untouched for 90 days (never ordered, not in a cart) with their pictures, guests (people who designed
 * without an account) idle for 30 days with everything they made, and old rate-limit rows.
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const db = getServiceClient();
  const now = new Date();

  // the check and the delete happen together in the database
  const { data: deleted, error } = await db.rpc('delete_stale_drafts', { p_before: staleBefore(now), p_limit: 500 });
  if (error) {
    console.error('cleanup: could not delete stale drafts', error.message);
    return NextResponse.json({ error: 'Cleanup failed.' }, { status: 500 });
  }
  const rows = (deleted ?? []) as { id: string; user_id: string }[];
  const uploads = db.storage.from('uploads');
  for (const { id, user_id } of rows) {
    // best effort: a picture left behind costs a little storage, nothing more
    const folder = `${user_id}/${id}`;
    const { data: files } = await uploads.list(folder, { limit: 100 });
    if (files?.length) await uploads.remove(files.map((f) => `${folder}/${f.name}`));
  }

  // guests who never came back: their designs and cart go with the login (they cascade); pictures are removed here
  const { data: guests, error: guestError } = await db.rpc('stale_guests', { p_before: staleBefore(now, GUEST_IDLE_DAYS), p_limit: 200 });
  if (guestError) console.error('cleanup: could not list idle guests', guestError.message);
  let guestCount = 0;
  for (const { id } of (guests ?? []) as { id: string }[]) {
    try {
      const { data: folders } = await uploads.list(id, { limit: 1000 });
      for (const folder of folders ?? []) {
        const { data: files } = await uploads.list(`${id}/${folder.name}`, { limit: 100 });
        if (files?.length) await uploads.remove(files.map((f) => `${id}/${folder.name}/${f.name}`));
      }
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) throw new Error(error.message);
      guestCount++;
    } catch (e) {
      console.error('cleanup: could not remove guest', id, e);
    }
  }

  // a rate-limit row older than a day is past every window
  const { count: limits } = await db.from('rate_limits').delete({ count: 'exact' }).lt('window_start', new Date(now.getTime() - 86_400_000).toISOString());

  return NextResponse.json({ drafts: rows.length, guests: guestCount, rateLimits: limits ?? 0 });
}
