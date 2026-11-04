import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdminLink } from '@/components/AdminLink';

/** The VybeCrew mark: a yellow tile with a bold V over a wave. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#ffd60a" />
      <path d="M9 15h13l10 24 10-24h13L38 51H26z" fill="#0a0a0a" />
      <path d="M10 56c7-5 11-5 18 0s11 5 18 0 8-3 8-3" fill="none" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** The name next to the mark. Use `tone="dark"` on a black background and `tone="light"` on white. */
export function Logo({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-display text-2xl font-extrabold tracking-tight">
      <LogoMark />
      <span className={tone === 'dark' ? 'text-white' : 'text-ink'}>
        Vybe<span className={tone === 'dark' ? 'text-marigold' : 'rounded bg-marigold px-1'}>Crew</span>
      </span>
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
