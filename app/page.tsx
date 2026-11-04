import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { TeeArt } from '@/components/TeeArt';
import { Suspense } from 'react';
import { catalog } from '@/lib/catalog';
import { DEFAULT_PRICES } from '@/lib/prices';
import { supabasePriceStore } from '@/lib/pricesStore';
import { pkr } from '@/lib/labels';

const STEPS = [
  ['1', 'Design it on the shirt'],
  ['2', 'A person checks it'],
  ['3', 'Pay and we deliver'],
] as const;

export default function HomePage() {
  return (
    <>
      <SiteHeader
        right={
          <Link className="underline" href="/login">
            Sign in
          </Link>
        }
      />
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-12">
        <section className="rise">
          <h1 className="font-display text-[3.1rem] font-extrabold leading-[0.95] tracking-tighter">
            Wear your
            <br />
            own{' '}
            <span className="bg-[linear-gradient(transparent_58%,var(--color-marigold)_58%_92%,transparent_92%)] px-1">name.</span>
          </h1>
          <p dir="rtl" className="mt-3 text-left font-urdu text-xl leading-loose text-vermilion">
            اپنا نام، اپنی شرٹ
          </p>
        </section>

        <section className="rise relative h-56 overflow-hidden rounded-3xl border-2 border-ink bg-paper-2" style={{ animationDelay: '80ms' }}>
          <div className="halftone absolute inset-0 opacity-15 [mask-image:linear-gradient(120deg,#000,transparent_65%)]" />
          <div className="absolute right-3 top-3 grid h-20 w-20 rotate-[8deg] place-items-center rounded-full border-2 border-ink bg-marigold text-center font-display text-[0.8rem] font-extrabold leading-none">
            100%
            <br />
            yours
          </div>
          <TeeArt className="absolute left-1/2 top-1/2 w-56 -translate-x-1/2 -translate-y-[48%] -rotate-3">
            <text x="400" y="470" textAnchor="middle" fontFamily="var(--font-bricolage)" fontWeight="800" fontSize="150" fill="#e5412a">
              ALI
            </text>
            <text x="400" y="560" textAnchor="middle" fontWeight="700" fontSize="42" letterSpacing="12" fill="#16120f">
              EST. 2026
            </text>
          </TeeArt>
        </section>

        <section className="rise flex flex-col gap-3" style={{ animationDelay: '160ms' }}>
          <Link href="/design" className="btn">
            Start designing &rarr;
          </Link>
          <Suspense fallback={<PriceLine prices={DEFAULT_PRICES} />}>
            <LivePriceLine />
          </Suspense>
        </section>

        <ol className="rise grid grid-cols-3 gap-2" style={{ animationDelay: '240ms' }}>
          {STEPS.map(([n, label]) => (
            <li key={n} className="border-t-[3px] border-ink pt-2 text-[0.8rem] leading-tight">
              <b className="block font-display text-2xl text-vermilion">{n}</b>
              {label}
            </li>
          ))}
        </ol>

        <ul className="rise grid grid-cols-2 gap-3" style={{ animationDelay: '320ms' }}>
          {(['tee', 'hoodie'] as const).map((id) => (
            <li key={id} className="rounded-xl border-2 border-ink bg-[#fffaf0] p-3">
              <p className="font-display text-lg font-extrabold">{catalog[id].label}</p>
              <Suspense fallback={<p className="text-sm">{pkr(DEFAULT_PRICES[id].pricePkr)}</p>}>
                <LiveProductPrice id={id} />
              </Suspense>
              <p className="text-xs text-mute">White or black &middot; S to XL</p>
            </li>
          ))}
        </ul>
        <Suspense fallback={<DeliveryLine fee={DEFAULT_PRICES.deliveryFeePkr} />}>
          <LiveDeliveryLine />
        </Suspense>

        <Link className="text-center text-sm underline" href="/orders">
          My designs and orders
        </Link>
      </main>
    </>
  );
}

// The owner can change prices at any time, so they are read when the page is requested.
const PriceLine = ({ prices }: { prices: typeof DEFAULT_PRICES }) => (
  <p className="text-center text-sm text-mute">
    T-shirt from {pkr(prices.tee.pricePkr)} &middot; Hoodie from {pkr(prices.hoodie.pricePkr)}
  </p>
);
const DeliveryLine = ({ fee }: { fee: number }) => (
  <p className="-mt-2 text-center text-xs text-mute">Delivery {pkr(fee)}. Every design is checked by a person before it is printed.</p>
);
const LivePriceLine = async () => <PriceLine prices={await supabasePriceStore().get()} />;
const LiveDeliveryLine = async () => <DeliveryLine fee={(await supabasePriceStore().get()).deliveryFeePkr} />;
const LiveProductPrice = async ({ id }: { id: 'tee' | 'hoodie' }) => (
  <p className="text-sm">{pkr((await supabasePriceStore().get())[id].pricePkr)}</p>
);
