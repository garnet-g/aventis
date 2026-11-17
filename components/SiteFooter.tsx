import Link from 'next/link';
import { Logo } from '@/components/SiteHeader';
import { business, whatsappLink } from '@/lib/business';

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-ink text-white">
      <div className="tape" aria-hidden />
      <div className="shell flex flex-col gap-8 py-8 lg:flex-row lg:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-2 text-sm text-white/60">Custom and ready-made T-shirts and hoodies, printed in Nairobi and delivered across Kenya. Pay with M-Pesa.</p>
          <a href={whatsappLink('Hello VybeCrew!')} className="mt-3 inline-block rounded-lg border-2 border-marigold px-3 py-1.5 text-sm font-bold text-marigold hover:bg-marigold hover:text-ink">
            Chat on WhatsApp &middot; {business.phone}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm font-bold sm:grid-cols-3 [&_a:hover]:text-marigold">
          <nav aria-label="Shop" className="flex flex-col gap-2">
            <Link href="/catalogue">Catalogue</Link>
            <Link href="/design" prefetch={false}>Design your own</Link>
            <Link href="/cart">Cart</Link>
            <Link href="/orders">My orders</Link>
          </nav>
          <nav aria-label="Help" className="flex flex-col gap-2">
            <Link href="/delivery">Delivery</Link>
            <Link href="/refunds">Refunds and returns</Link>
            <Link href="/contact">Contact us</Link>
            <Link href="/account">My account</Link>
          </nav>
          <nav aria-label="Legal" className="flex flex-col gap-2">
            <Link href="/terms">Terms of sale</Link>
            <Link href="/privacy">Privacy policy</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
