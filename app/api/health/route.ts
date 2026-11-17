import { connection, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

/**
 * For an uptime monitor: 200 when the site and its database answer, 503 otherwise. Reveals nothing else.
 * Point a monitor (for example UptimeRobot or Better Stack) at https://<your site>/api/health every few minutes.
 */
export async function GET() {
  await connection();
  const started = Date.now();
  const { error } = await getServiceClient().from('settings').select('key', { head: true, count: 'exact' }).limit(1);
  if (error) {
    console.error('health check: database unreachable', error.message);
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, dbMs: Date.now() - started }, { headers: { 'cache-control': 'no-store' } });
}
