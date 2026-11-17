'use client'; // error boundaries must be client components

import Link from 'next/link';
import { useEffect } from 'react';
import { SiteHeader } from '@/components/SiteHeader';

/** Shown when a page fails to load. "Try again" re-fetches the page; the reference matches the server log. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && 'digest' in error ? String((error as Error & { digest?: string }).digest ?? '') : '';
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <SiteHeader />
      <main className="shell flex flex-col items-start gap-5 py-16">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="font-display text-5xl font-extrabold tracking-tight">This page didn&rsquo;t load.</h1>
        <p className="max-w-xl text-lg text-mute">It may be a weak connection or a problem on our side. Your designs and cart are saved.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => retry()} className="btn sm:min-w-56">
            Try again
          </button>
          <Link href="/" className="btn btn-ink sm:min-w-56">
            Go to the home page
          </Link>
        </div>
        {digest && <p className="text-xs text-mute">Reference for support: {digest}</p>}
      </main>
    </>
  );
}
