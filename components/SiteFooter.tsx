import Link from 'next/link';
import { Logo } from '@/components/SiteHeader';

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-ink text-white">
      <div className="tape" aria-hidden />
      <div className="shell flex flex-col gap-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo />
          <p className="mt-2 text-sm text-white/60">Custom and ready-made T-shirts and hoodies, printed and delivered across Kenya.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold [&_a:hover]:text-marigold">
          <Link href="/catalogue">Catalogue</Link>
          <Link href="/design">Design your own</Link>
          <Link href="/cart">Cart</Link>
          <Link href="/orders">My orders</Link>
        </nav>
      </div>
    </footer>
  );
}
