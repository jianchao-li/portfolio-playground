import type { MetadataRoute } from 'next';
import { LANDING_PAGES, landingPath } from '@/lib/landingPages';
import { SITE_URL } from '@/lib/site';

// Rebuilt with the pages; results on every page change daily
export const revalidate = 86400;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    ...LANDING_PAGES.map((p) => ({
      url: `${SITE_URL}${landingPath(p)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
