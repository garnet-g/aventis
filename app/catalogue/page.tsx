import Link from 'next/link';
import { Suspense } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { catalog, type ProductId } from '@/lib/catalog';
import { previewKey } from '@/lib/catalogueItems';
import { cataloguePictureUrl, supabaseCatalogueStore } from '@/lib/catalogueStore';
import { pkr } from '@/lib/labels';
import { supabasePriceStore } from '@/lib/pricesStore';

export const metadata = { title: 'Catalogue', description: 'Ready-made VybeCrew T-shirt and hoodie designs. Pick one, choose your size and order.' };

const FILTERS: { id: 'all' | ProductId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tee', label: 'T-shirts' },
  { id: 'hoodie', label: 'Hoodies' },
];

export default function CataloguePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  return (
    <>
      <SiteHeader
        right={
          <>
            <a href="/cart">Cart</a>
            <a href="/orders">My orders</a>
          </>
        }
      />
      <main className="shell py-10">
        <p className="eyebrow">Ready to wear</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">The catalogue</h1>
        <p className="mt-2 max-w-2xl text-mute">Pick a VybeCrew design, choose your colour and size, and we print and deliver it. Want to change something? Open it in the editor.</p>
        <Suspense fallback={<p className="mt-8 text-sm text-mute">Loading…</p>}>
          <Grid searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function Grid({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const filter = FILTERS.find((f) => f.id === p)?.id ?? 'all';
  const [all, prices] = await Promise.all([supabaseCatalogueStore().list({ publishedOnly: true }), supabasePriceStore().get()]);
  const items = filter === 'all' ? all : all.filter((i) => i.product === filter);

  return (
    <>
      <nav aria-label="Filter" className="mt-6 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === 'all' ? '/catalogue' : `/catalogue?p=${f.id}`}
            aria-current={f.id === filter ? 'page' : undefined}
            className={`rounded-full border-2 border-ink px-4 py-1.5 text-sm font-bold ${f.id === filter ? 'bg-ink text-marigold' : 'hover:bg-marigold'}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p data-testid="catalogue-empty" className="mt-10 text-mute">
          {all.length === 0 ? 'New designs are coming soon.' : 'Nothing here yet.'} Meanwhile, you can{' '}
          <Link className="underline" href="/design">
            design your own
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const key = previewKey(item, item.colors[0]);
            const picture = key ? cataloguePictureUrl(item.mockups[key]) : null;
            const price = prices[item.product].pricePkr + (item.backLayers.length ? prices.backPricePkr : 0);
            return (
              <li key={item.id} data-testid="catalogue-card">
                <Link href={`/catalogue/${item.id}`} className="group block overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-[5px_5px_0_var(--color-marigold)] transition-transform hover:-translate-y-1">
                  <div className="bg-paper-2">
                    {picture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={picture} alt={item.title} loading="lazy" className="aspect-[4/5] w-full object-contain" />
                    ) : (
                      <div className="grid aspect-[4/5] place-items-center text-mute">No preview</div>
                    )}
                  </div>
                  <div className="border-t-2 border-ink p-4">
                    <p className="font-display text-xl font-extrabold leading-tight">{item.title}</p>
                    <p className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-mute">{catalog[item.product].label}</span>
                      <b>{pkr(price)}</b>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
