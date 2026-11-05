import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdminLink } from '@/components/AdminLink';

/** The VybeCrew logo. It is drawn for a dark background, so it is used on the black bars and panels only. */
export function Logo({ className = 'h-12' }: { className?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/vybecrew-logo.png" alt="" width={640} height={635} className={`${className} w-auto`} />
      <span className="hidden sm:inline">
        Vybe<span className="text-marigold">Crew</span>
      </span>
      <span className="sr-only sm:hidden">VybeCrew</span>
    </Link>
  );
}

/** The black bar at the top of every page. `right` holds the page's own links (cart, sign in, ...). */
export function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="bg-ink text-white">
      <div className="shell flex items-center justify-between gap-4 py-3">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm font-bold uppercase tracking-wide md:flex">
          <Link href="/catalogue" className="hover:text-marigold">
            Catalogue
          </Link>
          <Link href="/design" className="hover:text-marigold">
            Design your own
          </Link>
        </nav>
        <div className="flex items-center gap-4 text-sm font-bold [&_a:hover]:text-marigold">
          {right}
          <AdminLink />
        </div>
      </div>
      <nav aria-label="Main (small screens)" className="shell flex gap-6 pb-3 text-xs font-bold uppercase tracking-wide md:hidden">
        <Link href="/catalogue">Catalogue</Link>
        <Link href="/design">Design your own</Link>
      </nav>
      <div className="tape" aria-hidden />
    </header>
  );
}
