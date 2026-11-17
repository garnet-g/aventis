import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata = { title: 'Page not found' };

/** Shown for a wrong link, a hidden catalogue design, or a page someone is not allowed to see. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="shell flex flex-col items-start gap-5 py-16">
        <p className="eyebrow">Error 404</p>
        <h1 className="font-display text-5xl font-extrabold tracking-tight">This page could not be found.</h1>
        <p className="max-w-xl text-lg text-mute">The link may be old, or the design may no longer be available. Here is where you can go instead:</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/catalogue" className="btn sm:min-w-56">
            Shop the catalogue
          </Link>
          <Link href="/design" className="btn btn-ink sm:min-w-56">
            Design your own
          </Link>
        </div>
        <Link href="/" className="text-sm underline">
          Back to the home page
        </Link>
      </main>
    </>
  );
}
