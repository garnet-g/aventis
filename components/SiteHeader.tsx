import Link from 'next/link';
import type { ReactNode } from 'react';

/** A print-shop registration mark: circle with a crosshair. */
export function RegMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 1v22M1 12h22" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight">
      <RegMark />
      Printly
    </Link>
  );
}

export function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-4">
      <Logo />
      <div className="text-sm font-bold">{right}</div>
    </header>
  );
}
