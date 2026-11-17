import type { MetadataRoute } from 'next';
import { supabaseCatalogueStore } from '@/lib/catalogueStore';

const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** The public pages and every published catalogue design. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ['', '/catalogue', '/delivery', '/refunds', '/contact', '/terms', '/privacy'].map((p) => ({ url: `${site}${p}` }));
  try {
    const items = await supabaseCatalogueStore().list({ publishedOnly: true });
    return [...pages, ...items.map((i) => ({ url: `${site}/catalogue/${i.id}`, lastModified: i.createdAt }))];
  } catch {
    return pages;
  }
}
