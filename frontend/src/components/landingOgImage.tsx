import { ImageResponse } from 'next/og';
import { getPortfolioColor } from '@/lib/colors';
import { findLanding, type LandingKind } from '@/lib/landingPages';
import { SITE_NAME } from '@/lib/site';

export const OG_SIZE = { width: 1200, height: 630 };

const holdingsText = (assets: { symbol: string; weight: number }[]) =>
  assets.map((a) => `${a.symbol} ${Math.round(a.weight * 1000) / 10}%`).join(' · ');

/**
 * Social card for a landing page: its headline and the portfolios compared.
 * Static (no market data), so it renders at build time and never times out
 * for link-preview crawlers.
 */
export function landingOgImage(kind: LandingKind, slug: string) {
  const page = findLanding(kind, slug);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '64px 72px',
          background: 'linear-gradient(135deg, #f6f7f9 0%, #e6f2f1 100%)', color: '#1a1d23',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, fontWeight: 700, color: '#0f766e' }}>
          {SITE_NAME}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1 }}>
            {page?.heading ?? 'Portfolio backtest'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
            {(page?.portfolios ?? []).map((p, i) => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', fontSize: 30, marginTop: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: getPortfolioColor(i), marginRight: 18 }} />
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: '#5f6368', marginLeft: 16 }}>{holdingsText(p.assets)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#5f6368' }}>
          Free backtest · returns, volatility, Sharpe ratio, max drawdown
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
