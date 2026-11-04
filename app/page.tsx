import Link from 'next/link';
import { Suspense } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { TeeArt } from '@/components/TeeArt';
import { catalog } from '@/lib/catalog';
import { previewKey } from '@/lib/catalogueItems';
import { cataloguePictureUrl, supabaseCatalogueStore } from '@/lib/catalogueStore';
import { pkr } from '@/lib/labels';
import { DEFAULT_PRICES } from '@/lib/prices';
import { supabasePriceStore } from '@/lib/pricesStore';

const STEPS = [
  ['1', 'Pick a drop or build your own', 'Choose a ready-made design from the catalogue, or put your own name and art on the shirt.'],
  ['2', 'A person checks it', 'Every design is looked at before printing, so what reaches you is clean and printable.'],
  ['3', 'Pay and we deliver', 'Pay securely, we print with our partner and post it to your door anywhere in Pakistan.'],
] as const;

export default function HomePage() {
  return (
    <>
      <SiteHeader
        right={
          <>
            <Link href="/cart">Cart</Link>
            <Link href="/login" className="rounded-lg border-2 border-marigold px-3 py-1.5 text-marigold hover:!bg-marigold hover:!text-ink">
              Sign in
            </Link>
          </>
        }
      />

      <section className="bg-ink text-white">
        <div className="shell grid items-center gap-10 py-12 lg:grid-cols-2 lg:py-20">
          <div className="rise">
            <p className="mb-4 inline-block rounded bg-marigold px-2 py-1 text-xs font-extrabold uppercase tracking-[0.18em] text-ink">Printed in Pakistan</p>
            <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tighter sm:text-6xl lg:text-7xl">
              Wear your
              <br />
              own <span className="text-marigold">vybe.</span>
            </h1>
            <p dir="rtl" className="mt-4 text-left font-urdu text-2xl leading-loose text-marigold">
              اپنا نام، اپنی شرٹ
            </p>
            <p className="mt-2 max-w-xl text-lg text-white/80">
              Shop ready-made VybeCrew drops, or put your own name and art on a T-shirt or hoodie. We print it and deliver it.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link href="/catalogue" className="btn sm:min-w-56">
                Shop the catalogue
              </Link>
              <Link href="/design" className="btn btn-ink border-white sm:min-w-56">
                Start designing &rarr;
              </Link>
            </div>
            <Suspense fallback={<PriceLine prices={DEFAULT_PRICES} />}>
              <LivePriceLine />
            </Suspense>
          </div>

          <div className="rise relative mx-auto flex h-80 w-full max-w-lg items-center justify-center overflow-hidden rounded-3xl border-2 border-marigold bg-[#151515] sm:h-96 lg:h-[28rem]" style={{ animationDelay: '120ms' }}>
            <div className="halftone absolute inset-0 text-white opacity-10 [mask-image:linear-gradient(120deg,#000,transparent_65%)]" />
            <div className="absolute right-4 top-4 grid h-24 w-24 rotate-[8deg] place-items-center rounded-full border-2 border-ink bg-marigold text-center font-display text-sm font-extrabold leading-none text-ink">
              100%
              <br />
              yours
            </div>
            <TeeArt className="relative w-60 -rotate-3 sm:w-72 lg:w-80" fill="#ffffff">
              <text x="400" y="470" textAnchor="middle" fontFamily="var(--font-bricolage)" fontWeight="800" fontSize="150" fill="#0a0a0a">
                ALI
              </text>
              <text x="400" y="560" textAnchor="middle" fontWeight="700" fontSize="42" letterSpacing="12" fill="#0a0a0a">
                EST. 2026
              </text>
              <rect x="330" y="600" width="140" height="18" fill="#ffd60a" />
            </TeeArt>
          </div>
        </div>
        <div className="tape" aria-hidden />
      </section>

      <main>
        <Suspense>
          <FeaturedCatalogue />
        </Suspense>

        <section className="shell py-14">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map(([n, title, body]) => (
              <li key={n} className="ticket">
                <b className="grid h-12 w-12 place-items-center rounded-full bg-ink font-display text-2xl text-marigold">{n}</b>
                <p className="mt-3 font-display text-xl font-extrabold">{title}</p>
                <p className="mt-1 text-sm text-mute">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-paper-2">
          <div className="shell py-14">
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">What you can wear</h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2">
              {(['tee', 'hoodie'] as const).map((id) => (
                <li key={id} className="ticket flex items-center justify-between gap-4">
                  <div>
                    <p className="font-display text-2xl font-extrabold">{catalog[id].label}</p>
                    <Suspense fallback={<p>{pkr(DEFAULT_PRICES[id].pricePkr)}</p>}>
                      <LiveProductPrice id={id} />
                    </Suspense>
                    <p className="text-sm text-mute">White or black &middot; S to XL &middot; front and back printing</p>
                  </div>
                  <Link href="/design" className="btn btn-sm shrink-0">
                    Design
                  </Link>
                </li>
              ))}
            </ul>
            <Suspense fallback={<DeliveryLine fee={DEFAULT_PRICES.deliveryFeePkr} />}>
              <LiveDeliveryLine />
            </Suspense>
          </div>
        </section>
      </main>

      <section className="bg-ink text-white">
        <div className="shell flex flex-col items-start justify-between gap-4 py-10 sm:flex-row sm:items-center">
          <p className="font-display text-3xl font-extrabold tracking-tight">
            Ready to join the <span className="text-marigold">crew?</span>
          </p>
          <Link href="/orders" className="underline hover:text-marigold">
            My designs and orders
          </Link>
        </div>
      </section>
    </>
  );
}

// The owner can change prices at any time, so they are read when the page is requested.
const PriceLine = ({ prices }: { prices: typeof DEFAULT_PRICES }) => (
  <p className="mt-6 text-sm text-white/70">
    T-shirt from {pkr(prices.tee.pricePkr)} &middot; Hoodie from {pkr(prices.hoodie.pricePkr)}
  </p>
);
const DeliveryLine = ({ fee }: { fee: number }) => (
  <p className="mt-6 text-sm text-mute">Delivery {pkr(fee)}. Every design is checked by a person before it is printed.</p>
);
const LivePriceLine = async () => <PriceLine prices={await supabasePriceStore().get()} />;
const LiveDeliveryLine = async () => <DeliveryLine fee={(await supabasePriceStore().get()).deliveryFeePkr} />;
const LiveProductPrice = async ({ id }: { id: 'tee' | 'hoodie' }) => (
  <p className="text-lg font-bold">{pkr((await supabasePriceStore().get())[id].pricePkr)}</p>
);

/** The newest published catalogue designs; renders nothing until the first one is posted. */
async function FeaturedCatalogue() {
  const items = (await supabaseCatalogueStore().list({ publishedOnly: true })).slice(0, 4);
  if (!items.length) return null;
  return (
    <section className="shell pt-14" aria-label="From the catalogue">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Fresh drops</h2>
        <Link href="/catalogue" className="font-bold underline">
          See the whole catalogue &rarr;
        </Link>
      </div>
      <ul className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
        {items.map((item) => {
          const key = previewKey(item, item.colors[0]);
          return (
            <li key={item.id}>
              <Link href={`/catalogue/${item.id}`} className="block overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-[5px_5px_0_var(--color-marigold)] transition-transform hover:-translate-y-1">
                <div className="bg-paper-2">
                  {key && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cataloguePictureUrl(item.mockups[key])} alt={item.title} loading="lazy" className="aspect-[4/5] w-full object-contain" />
                  )}
                </div>
                <p className="border-t-2 border-ink p-3 font-display text-lg font-extrabold leading-tight">{item.title}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
