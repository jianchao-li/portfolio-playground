import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import type { Rebalance } from './api';
import { DEFAULT_CURRENCY, PortfolioInput, fetchComparison, type ComparisonResult } from './portfolios';

// Generous, because a regeneration may have to wake a sleeping Render instance
const PREFETCH_TIMEOUT_MS = 60_000;

/**
 * Whether a failed prefetch should fall back to a page without data (the
 * client then loads the portfolios itself) instead of failing the render.
 *
 * - `next build` (NEXT_PHASE === PHASE_PRODUCTION_BUILD): there is no earlier
 *   page to keep, and a backend outage must not break the deploy.
 * - `next dev`: every request renders, so failing would just show an error.
 *
 * Otherwise this is an ISR regeneration on the production server. Throwing
 * there makes Next.js keep serving the last good page (and retry on a later
 * request) instead of caching a data-less page until the next regeneration.
 */
const canFallBackWithoutData = () =>
  process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD || process.env.NODE_ENV !== 'production';

/**
 * Server-side analysis of a page's starting view, aligned to the latest
 * common start (as the client loads it), or null if it failed and the page
 * may render without data.
 */
export async function prefetchView(
  portfolios: PortfolioInput[], startDate: string, endDate: string, rebalance: Rebalance
): Promise<ComparisonResult | null> {
  try {
    return await fetchComparison(
      portfolios, startDate, endDate, DEFAULT_CURRENCY,
      AbortSignal.timeout(PREFETCH_TIMEOUT_MS), true, rebalance
    );
  } catch (err) {
    if (!canFallBackWithoutData()) {
      throw new Error('Prefetching portfolios failed; keeping the previous page', { cause: err });
    }
    console.error('Prefetching portfolios failed:', err);
    return null;
  }
}
