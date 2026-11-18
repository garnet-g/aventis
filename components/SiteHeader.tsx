import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AccountMenu } from '@/components/AccountMenu';
// A static import: Next.js serves a resized WebP under a content-hashed URL that browsers may cache for good.
import logoImage from '@/public/brand/vibecrew-logo.png';

export { logoImage };

/** The VibeCrew logo. It is drawn for a dark background, so it is used on the black bars and panels only. */
export function Logo({ className = 'h-12' }: { className?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight text-white">
      <Image src={logoImage} alt="" sizes="56px" className={`${className} w-auto`} />
      <span className="hidden sm:inline">
        Vibe<span className="text-marigold">Crew</span>
      </span>
      <span className="sr-only sm:hidden">VibeCrew</span>
    </Link>
  );
}

const LINKS = [
  { href: '/catalogue', label: 'Catalogue' },
  { href: '/design', label: 'Design your own' },
  { href: '/cart', label: 'Cart' },
  { href: '/orders', label: 'My prints' },
];

/**
 * The black bar at the top of every page: the same links everywhere, then sign in, or account / admin / sign out.
 * `right` adds something page-specific (the checkout step). Links don't prefetch: most visitors never open them all.
 */
export function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="bg-ink text-white">
      <div className="shell flex items-center justify-between gap-4 py-3">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm font-bold uppercase tracking-wide md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} prefetch={false} className="hover:text-marigold">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4 text-sm font-bold [&_a:hover]:text-marigold">
          {right}
          <AccountMenu />
        </div>
      </div>
      <nav aria-label="Main (small screens)" className="shell flex gap-x-5 gap-y-2 overflow-x-auto pb-3 text-xs font-bold uppercase tracking-wide md:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} prefetch={false} className="whitespace-nowrap">
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="tape" aria-hidden />
    </header>
  );
}
