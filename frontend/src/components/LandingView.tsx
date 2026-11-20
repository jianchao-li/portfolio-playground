import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PortfolioPlayground from '@/app/PortfolioPlayground';
import JsonLd, { landingGraph } from './JsonLd';
import LandingLinks from './LandingLinks';
import {
  findLanding, landingPath, relatedLandings, type LandingKind,
} from '@/lib/landingPages';
import { todayISO } from '@/lib/portfolios';
import { prefetchView } from '@/lib/prefetch';
import { summarizeComparison } from '@/lib/summary';
import { OPEN_GRAPH_DEFAULTS, TWITTER_DEFAULTS } from '@/lib/site';

export function landingMetadata(kind: LandingKind, slug: string): Metadata {
  const page = findLanding(kind, slug);
  if (!page) return {};
  const path = landingPath(page);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: path },
    // Images come from ./opengraph-image (a per-page chart card)
    openGraph: {
      ...OPEN_GRAPH_DEFAULTS, title: page.title, description: page.description, url: path, type: 'article',
    },
    twitter: { ...TWITTER_DEFAULTS, title: page.title, description: page.description },
  };
}

/** A landing page: the playground preloaded with its portfolios, plus context. */
export default async function LandingView({ kind, slug }: { kind: LandingKind; slug: string }) {
  const page = findLanding(kind, slug);
  if (!page) notFound();

  const endDate = todayISO();
  const prefetched = await prefetchView(page.portfolios, page.startDate, endDate, page.rebalance);
  const results = prefetched?.results ?? null;
  const shownStart = results?.[0]?.performance.dates[0];
  const shownEnd = results?.[0]?.performance.dates.at(-1);
  const summary = results && shownStart && shownEnd
    ? summarizeComparison(results.map((r) => r.stats), shownStart, shownEnd)
    : null;
  const related = relatedLandings(page);
  const view = { portfolios: page.portfolios, startDate: page.startDate, rebalance: page.rebalance };

  return (
    <>
      <JsonLd data={landingGraph(page)} />
      <PortfolioPlayground
        initialResults={results}
        initialAlignedStart={prefetched?.alignedStart ?? null}
        initialEndDate={endDate}
        view={view}
        title={page.heading}
        linkBrand
      >
        <div className="guide">
          <article className="guide-card" aria-labelledby="landing-about">
            <h2 id="landing-about">About this comparison</h2>
            {summary && <p className="guide-lead">{summary}</p>}
            {page.intro.map((text) => <p key={text}>{text}</p>)}
            <p className="guide-note">
              Holdings:{' '}
              {page.portfolios.map((p, i) => (
                <span key={p.name}>
                  {i > 0 && '; '}
                  <strong>{p.name}</strong>{' '}
                  {p.assets.map((a) => `${a.symbol} ${Math.round(a.weight * 1000) / 10}%`).join(', ')}
                </span>
              ))}
              . {page.rebalance === 'none'
                ? 'Buy-and-hold, dividends reinvested.'
                : `Rebalanced ${page.rebalance}, dividends reinvested.`}{' '}
              Change the dates, currency or holdings above to run your own version, or read{' '}
              <a href="/#how-it-works">how the backtest works</a>.
            </p>
            {related.length > 0 && (
              <>
                <h3>Related backtests</h3>
                <ul className="related-links">
                  {related.map((p) => (
                    <li key={p.slug}><a href={landingPath(p)}>{p.linkLabel}</a></li>
                  ))}
                </ul>
              </>
            )}
          </article>
          <LandingLinks exclude={page} heading="More backtests" />
        </div>
      </PortfolioPlayground>
    </>
  );
}
