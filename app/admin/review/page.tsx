import { Suspense } from 'react';
import { ReviewActions } from '@/components/ReviewActions';
import { requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';

export default function ReviewQueuePage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
      <ReviewQueue />
    </Suspense>
  );
}

async function ReviewQueue() {
  await requireAdmin();
  const { data } = await getServiceClient()
    .from('designs')
    .select('id, product, color, size, back_layers, updated_at')
    .eq('status', 'pending_review')
    .order('updated_at', { ascending: true });

  return (
    <main>
      <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight">Designs waiting for review</h1>
      {!data?.length && <p className="text-mute">Nothing is waiting for review.</p>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {data?.map((d) => (
          <li key={d.id} className="ticket flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/admin/designs/${d.id}/preview`} alt="Design preview, front" className="w-full rounded-lg border-2 border-ink bg-paper-2" />
            {Array.isArray(d.back_layers) && d.back_layers.length > 0 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/admin/designs/${d.id}/preview?side=back`} alt="Design preview, back" className="w-full rounded-lg border-2 border-ink bg-paper-2" />
            )}
            <p className="text-sm">
              {d.product} · {d.color} · {d.size}{Array.isArray(d.back_layers) && d.back_layers.length > 0 ? ' · front and back' : ''}
            </p>
            <ReviewActions designId={d.id} />
          </li>
        ))}
      </ul>
    </main>
  );
}
