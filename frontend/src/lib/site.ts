/** Site-wide constants shared by metadata, robots, sitemap and structured data. */

export const SITE_NAME = 'Portfolio Playground';

/** Canonical origin (no trailing slash), for absolute URLs in metadata. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://portfolio-playground-frontend.vercel.app'
).replace(/\/+$/, '');

export const AUTHOR = {
  name: 'Jianchao Li',
  url: 'https://jianchao.xyz',
};
export const ABOUT_URL = 'https://jianchao.xyz/projects/portfolio-playground/';
export const SOURCE_URL = 'https://github.com/jianchao-li/portfolio-playground';

/**
 * Whether search engines may index this deployment. Vercel preview and
 * development deployments set VERCEL_ENV to something other than
 * "production"; outside Vercel (VERCEL_ENV unset) indexing is allowed.
 */
export const INDEXABLE = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production';

/** Default social image (public/og.jpg). */
export const OG_IMAGE = {
  url: '/og.jpg',
  width: 1200,
  height: 630,
  alt: 'Portfolio Playground comparing S&P 500, developed and emerging markets',
};

/**
 * Open Graph fields every page shares. Next.js replaces (doesn't merge) a
 * parent's openGraph/twitter objects, so pages spread these in.
 */
export const OPEN_GRAPH_DEFAULTS = { siteName: SITE_NAME, locale: 'en_US' } as const;
export const TWITTER_DEFAULTS = { card: 'summary_large_image' } as const;
