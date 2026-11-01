import Link from 'next/link';
import { Suspense } from 'react';
import { DesignFlow } from '@/components/DesignFlow';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';

// Reading the session happens at request time, so it streams in behind a Suspense boundary (Cache Components).
export default function DesignPage() {
  return (
    <>
      <SiteHeader right={<Link href="/orders">My orders</Link>} />
      <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
        <SignedInDesign />
      </Suspense>
    </>
  );
}

async function SignedInDesign() {
  await requireUser();
  return <DesignFlow />;
}
