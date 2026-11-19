'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession } from '@/lib/guest';

/** Lets a visitor start designing at once: a guest session is created and the page reloads with it. */
export function GuestStart({ next }: { next: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void ensureSession().then((ok) => {
      if (!live) return;
      if (ok) router.refresh();
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [router]);
  if (failed) {
    return (
      <p className="shell py-10 text-sm">
        We could not open the designer just now.{' '}
        <Link className="underline" href={`/login?next=${encodeURIComponent(next)}`}>
          Sign in or create an account
        </Link>{' '}
        to continue.
      </p>
    );
  }
  return <p className="shell py-10 text-sm text-mute">Opening the designer…</p>;
}
