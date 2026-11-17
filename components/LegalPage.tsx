import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/SiteHeader';

/** A plain, readable page for terms, privacy and help content. */
export function LegalPage({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated?: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="shell py-10">
        <article className="mx-auto flex max-w-3xl flex-col gap-4 [&_a]:underline [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-extrabold [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
          {updated && <p className="text-sm text-mute">Last updated {updated}</p>}
          {children}
        </article>
      </main>
    </>
  );
}
