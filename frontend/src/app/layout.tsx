import './globals.css';
import type { Metadata, Viewport } from 'next';
import { API_BASE } from '@/lib/api';
import {
  AUTHOR, INDEXABLE, OG_IMAGE, OPEN_GRAPH_DEFAULTS, SITE_NAME, SITE_URL, TWITTER_DEFAULTS,
} from '@/lib/site';

// Search-facing copy: says what the tool does in the words people search with
const HOME_TITLE = 'Free Portfolio Backtest & ETF Comparison Tool | Portfolio Playground';
const DESCRIPTION =
  'Free portfolio backtester: compare ETFs like VOO, QQQ and gold side by side. ' +
  'See historical growth, annualized return, volatility, Sharpe, Sortino and max ' +
  'drawdown, with rebalancing, in 40 currencies.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: HOME_TITLE, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [AUTHOR],
  creator: AUTHOR.name,
  // Share links (/?v=1&p=...) all serve the same HTML; pages override this
  alternates: { canonical: '/' },
  robots: INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    ...OPEN_GRAPH_DEFAULTS,
    type: 'website',
    title: HOME_TITLE,
    description: DESCRIPTION,
    url: '/',
    images: [OG_IMAGE],
  },
  twitter: {
    ...TWITTER_DEFAULTS,
    title: HOME_TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
};

/** Origin of the backend API, or null if NEXT_PUBLIC_API_URL isn't a valid URL. */
function apiOrigin(): string | null {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return null;
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const origin = apiOrigin();
  return (
    <html lang="en">
      <head>
        {origin && (
          <>
            {/* Warm up DNS + TCP + TLS to the backend before the first
                interaction (a fresh connection to Render measured 0.5-0.9 s).
                crossOrigin matches fetch()'s uncredentialed CORS requests. */}
            <link rel="preconnect" href={origin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={origin} />
          </>
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
