import { Suspense } from 'react';
import { CatalogueForm, CatalogueRowActions } from '@/components/CatalogueAdmin';
import { requireAdmin } from '@/lib/auth';
import { catalog } from '@/lib/catalog';
import { previewKey } from '@/lib/catalogueItems';
import { cataloguePictureUrl, supabaseCatalogueStore } from '@/lib/catalogueStore';

export const metadata = { title: 'Catalogue (admin)' };

export default function AdminCataloguePage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
      <AdminCatalogue />
    </Suspense>
  );
}

async function AdminCatalogue() {
  await requireAdmin();
  const items = await supabaseCatalogueStore().list();

  return (
    <main className="flex flex-col gap-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Catalogue</h1>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <CatalogueForm />
        <section aria-label="Posted designs">
          {items.length === 0 ? (
            <p className="text-mute">Nothing posted yet.</p>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const key = previewKey(item, item.colors[0]);
                return (
                  <li key={item.id} data-testid="admin-catalogue-item" className="ticket flex flex-col gap-3">
                    <div className="overflow-hidden rounded-lg border-2 border-ink bg-paper-2">
                      {key ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cataloguePictureUrl(item.mockups[key])} alt={item.title} className="aspect-[4/5] w-full object-contain" />
                      ) : (
                        <div className="grid aspect-[4/5] place-items-center text-sm text-mute">No preview</div>
                      )}
                    </div>
                    <div>
                      <p className="font-display text-lg font-extrabold leading-tight">{item.title}</p>
                      <p className="text-sm text-mute">
                        {catalog[item.product].label} &middot; {item.colors.join(' + ')}
                      </p>
                      <span className={`badge mt-2 ${item.published ? 'badge-gold' : 'badge-ink'}`}>{item.published ? 'Published' : 'Hidden'}</span>
                    </div>
                    <CatalogueRowActions id={item.id} published={item.published} title={item.title} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
