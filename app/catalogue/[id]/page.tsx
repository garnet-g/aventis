import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CatalogueOrder } from '@/components/CatalogueOrder';
import { SiteHeader } from '@/components/SiteHeader';
import { catalog } from '@/lib/catalog';
import { previewKey } from '@/lib/catalogueItems';
import { cataloguePictureUrl, supabaseCatalogueStore } from '@/lib/catalogueStore';
import { bulkTiersLabel, kes } from '@/lib/labels';
import { supabasePriceStore } from '@/lib/pricesStore';

/** Each design gets its own title, description and share picture (what WhatsApp shows when the link is shared). */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const item = /^[0-9a-f-]{36}$/i.test(id) ? await supabaseCatalogueStore().get(id).catch(() => null) : null;
  if (!item || !item.published) return { title: 'Design not found' };
  const key = previewKey(item, item.colors[0]);
  const description = item.description || `${catalog[item.product].label} by VybeCrew, printed in Nairobi and delivered across Kenya.`;
  return {
    title: item.title,
    description,
    openGraph: { title: item.title, description, images: key ? [{ url: cataloguePictureUrl(item.mockups[key]), width: 800, height: 1000 }] : undefined },
  };
}

export default function CatalogueItemPage({ params }: { params: Promise<{ id: string }> }) {
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
      <Suspense fallback={<p className="shell py-10 text-sm text-mute">Loading…</p>}>
        <Item params={params} />
      </Suspense>
    </>
  );
}

async function Item({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A malformed id is simply "not found"; so is a design that has not been published.
  const item = /^[0-9a-f-]{36}$/i.test(id) ? await supabaseCatalogueStore().get(id) : null;
  if (!item || !item.published) notFound();
  const prices = await supabasePriceStore().get();
  const price = prices[item.product].priceKes + (item.backLayers.length ? prices.backPriceKes : 0);
  const previews = Object.fromEntries(Object.entries(item.mockups).map(([k, path]) => [k, cataloguePictureUrl(path)]));

  return (
    <main className="shell py-10">
      <p className="mb-6 text-sm">
        <Link href="/catalogue" className="underline">
          &larr; Catalogue
        </Link>
      </p>
      <div className="mb-8 max-w-2xl">
        <p className="eyebrow">{catalog[item.product].label}</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{item.title}</h1>
        {item.description && <p className="mt-3 text-lg text-mute">{item.description}</p>}
        <p className="mt-3 font-display text-3xl font-extrabold">{kes(price)}</p>
        {item.backLayers.length > 0 && <p className="text-sm text-mute">Printed on the {item.layers.length ? 'front and back' : 'back'}.</p>}
      </div>
      <CatalogueOrder itemId={item.id} colors={item.colors} previews={previews} unitPriceLabel={kes(price)} bulkNote={bulkTiersLabel(prices.bulkTiers)} />
    </main>
  );
}
