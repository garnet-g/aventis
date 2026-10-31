import { Suspense } from 'react';
import { DesignFlow } from '@/components/DesignFlow';
import { requireUser } from '@/lib/auth';

// Reading the session happens at request time, so it streams in behind a Suspense boundary (Cache Components).
export default function DesignPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-neutral-500">Loading…</p>}>
      <SignedInDesign />
    </Suspense>
  );
}

async function SignedInDesign() {
  await requireUser();
  return <DesignFlow />;
}
