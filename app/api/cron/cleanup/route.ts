import { NextResponse } from 'next/server';
import { cronAuthorized, staleBefore } from '@/lib/cleanup';
import { supabaseDesignStore } from '@/lib/designsStore';
import { getServiceClient } from '@/lib/supabase/server';

/**
 * Daily housekeeping, called by the server's cron with "Authorization: Bearer $CRON_SECRET":
 * deletes drafts untouched for 90 days (never ordered, not in a cart) with their pictures, and old rate-limit rows.
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const db = getServiceClient();
  const now = new Date();

  const { data: stale } = await db.from('designs').select('id').eq('status', 'draft').lt('updated_at', staleBefore(now)).limit(500);
  const ids = (stale ?? []).map((d) => d.id as string);
  const [{ data: ordered }, { data: carted }] = ids.length
    ? await Promise.all([db.from('orders').select('design_id').in('design_id', ids), db.from('cart_items').select('design_id').in('design_id', ids)])
    : [{ data: [] }, { data: [] }];
  const keep = new Set([...(ordered ?? []), ...(carted ?? [])].map((r) => r.design_id as string));
  const store = supabaseDesignStore();
  let drafts = 0;
  for (const id of ids) {
    if (keep.has(id)) continue;
    try {
      await store.remove(id);
      drafts++;
    } catch (e) {
      console.error('cleanup: could not delete draft', id, e);
    }
  }

  // a rate-limit row older than a day is past every window
  const { count: limits } = await db.from('rate_limits').delete({ count: 'exact' }).lt('window_start', new Date(now.getTime() - 86_400_000).toISOString());

  return NextResponse.json({ drafts, rateLimits: limits ?? 0 });
}
