import { connection } from 'next/server';
import { Suspense } from 'react';
import { ReviewActions } from '@/components/ReviewActions';
import { requireAdmin } from '@/lib/auth';
import { catalog, colorLabel, type Color, type ProductId } from '@/lib/catalog';
import { emailForUser } from '@/lib/paymentService';
import { getServiceClient } from '@/lib/supabase/server';

export const metadata = { title: 'Review queue (admin)' };

export default function ReviewQueuePage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
      <ReviewQueue />
    </Suspense>
  );
}

/** The embedded one-to-one row comes back as an object (or, from older clients, a one-item list). */
const reasonOf = (r: unknown) => ((Array.isArray(r) ? r[0] : r) as { reason?: string } | null)?.reason ?? '';

function waiting(since: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

/** The designs waiting, oldest first, with who sent each and how long it has waited (read here, not while rendering). */
async function loadQueue() {
  await connection();
  const { data } = await getServiceClient()
    .from('designs')
    .select('id, user_id, product, color, size, back_layers, updated_at, design_review_reasons(reason)')
    .eq('status', 'pending_review')
    .order('updated_at', { ascending: true })
    .limit(100);
  const rows = data ?? [];
  const emails = new Map(await Promise.all([...new Set(rows.map((d) => d.user_id as string))].map(async (id) => [id, await emailForUser(id).catch(() => null)] as const)));
  const now = Date.now();
  return { rows: rows.map((d) => ({ ...d, waitingFor: waiting(d.updated_at as string, now) })), emails };
}

async function ReviewQueue() {
  await requireAdmin();
  const { rows, emails } = await loadQueue();

  return (
    <main>
      <h1 className="mb-1 font-display text-3xl font-extrabold tracking-tight">Designs waiting for review</h1>
      <p className="mb-4 text-sm text-mute">Oldest first. The customer is emailed when you decide.</p>
      {!rows.length && <p className="text-mute">Nothing is waiting for review.</p>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {rows.map((d) => {
          // the version in the link lets the browser keep the preview until the design changes
          const v = encodeURIComponent(d.updated_at as string);
          const hasBack = Array.isArray(d.back_layers) && d.back_layers.length > 0;
          return (
            <li key={d.id} className="ticket flex flex-col gap-3" data-testid="review-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/admin/designs/${d.id}/preview?v=${v}`} alt="Design preview, front" className="w-full rounded-lg border-2 border-ink bg-paper-2" />
              {hasBack && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/admin/designs/${d.id}/preview?side=back&v=${v}`} alt="Design preview, back" className="w-full rounded-lg border-2 border-ink bg-paper-2" />
              )}
              <p className="text-sm">
                {catalog[d.product as ProductId]?.label ?? d.product} · {colorLabel(d.color as Color)} · {d.size}
                {hasBack ? ' · front and back' : ''}
              </p>
              <p className="text-sm">
                <b>Why it is here:</b> {reasonOf(d.design_review_reasons) || 'The automatic check was not sure.'}
              </p>
              <p className="text-xs text-mute">
                {emails.get(d.user_id as string) ?? 'Unknown customer'} · waiting {d.waitingFor}
              </p>
              <ReviewActions designId={d.id} />
            </li>
          );
        })}
      </ul>
    </main>
  );
}
