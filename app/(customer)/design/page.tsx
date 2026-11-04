import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DesignFlow } from '@/components/DesignFlow';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { supabaseDesignStore } from '@/lib/designsStore';
import { getServiceClient } from '@/lib/supabase/server';

const SIGNED_LINK_SECONDS = 3600;

// Reading the session happens at request time, so it streams in behind a Suspense boundary (Cache Components).
export default function DesignPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  return (
    <>
      <SiteHeader
        right={
          <span className="flex gap-4">
            <Link href="/cart">Cart</Link>
            <Link href="/orders">My orders</Link>
          </span>
        }
      />
      <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
        <SignedInDesign searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SignedInDesign({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await requireUser();
  const { d } = await searchParams;
  if (!d) return <DesignFlow />;

  // Resume a saved design: only its owner, and only while it can still be edited.
  const store = supabaseDesignStore();
  const design = await store.get(d);
  if (!design || design.userId !== user.id) notFound();
  if (design.status === 'pending_review' || (await store.hasOrder(design.id))) redirect('/orders');

  // The uploads bucket is private, so each saved picture gets a temporary link to be drawn from.
  const ownPrefix = `${user.id}/${design.id}/`;
  const paths = [...design.layers, ...design.backLayers].flatMap((l) => (l.kind === 'image' && l.uploadPath.startsWith(ownPrefix) ? [l.uploadPath] : []));
  const urls: Record<string, string> = {};
  if (paths.length) {
    const { data } = await getServiceClient().storage.from('uploads').createSignedUrls(paths, SIGNED_LINK_SECONDS);
    for (const row of data ?? []) if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
  }

  return (
    <DesignFlow
      initial={{
        id: design.id,
        product: design.product,
        color: design.color,
        size: design.size,
        layers: design.layers,
        backLayers: design.backLayers,
        urls,
      }}
    />
  );
}
