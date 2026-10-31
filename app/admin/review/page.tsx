import { ReviewActions } from '@/components/ReviewActions';
import { requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ReviewQueuePage() {
  await requireAdmin();
  const { data } = await getServiceClient()
    .from('designs')
    .select('id, product, color, size, updated_at')
    .eq('status', 'pending_review')
    .order('updated_at', { ascending: true });

  return (
    <main>
      <h1 className="mb-4 text-2xl font-bold">Designs waiting for review</h1>
      {!data?.length && <p className="text-neutral-600">Nothing is waiting for review.</p>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {data?.map((d) => (
          <li key={d.id} className="flex flex-col gap-3 rounded border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/admin/designs/${d.id}/preview`} alt="Design preview" className="w-full rounded bg-neutral-100" />
            <p className="text-sm">
              {d.product} · {d.color} · {d.size}
            </p>
            <ReviewActions designId={d.id} />
          </li>
        ))}
      </ul>
    </main>
  );
}
