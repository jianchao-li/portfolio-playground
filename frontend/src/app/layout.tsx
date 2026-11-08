import './globals.css';
import type { Metadata, Viewport } from 'next';
import { API_BASE } from '@/lib/api';

const SITE_NAME = 'Portfolio Playground';
const DESCRIPTION =
  'Build custom portfolios from real market data, compare historical returns, ' +
  'volatility, Sharpe ratio and max drawdown, in 40 currencies.';
// Absolute base for Open Graph / Twitter image URLs
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://portfolio-playground-frontend.vercel.app';
const OG_IMAGE = {
  url: '/og.jpg',
  width: 1200,
  height: 630,
  alt: 'Portfolio Playground comparing S&P 500, developed and emerging markets',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    url: '/',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
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
