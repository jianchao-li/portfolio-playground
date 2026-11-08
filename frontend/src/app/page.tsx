import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import PortfolioPlayground from './PortfolioPlayground';
import {
  DEFAULT_CURRENCY, DEFAULT_PORTFOLIOS, DEFAULT_START_DATE, PortfolioResult, fetchAll, todayISO,
} from '@/lib/portfolios';

// Re-render (and re-fetch the default portfolios) at most once an hour.
// Visitors get the cached page instantly, so they never wait on the backend
// for the first paint, even when Render is cold.
export const revalidate = 3600;

// Generous, because a regeneration may have to wake a sleeping Render instance
const PREFETCH_TIMEOUT_MS = 60_000;

/**
 * Whether a failed prefetch should fall back to a page without data (the
 * client then loads the defaults itself) instead of failing the render.
 *
 * - `next build` (NEXT_PHASE === PHASE_PRODUCTION_BUILD): there is no earlier
 *   page to keep, and a backend outage must not break the deploy.
 * - `next dev`: every request renders, so failing would just show an error.
 *
 * Otherwise this is an ISR regeneration on the production server. Throwing
 * there makes Next.js keep serving the last good page (and retry on a later
 * request) instead of caching a data-less page for the next hour.
 */
const canFallBackWithoutData = () =>
  process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD || process.env.NODE_ENV !== 'production';

export default async function Page() {
  const endDate = todayISO();
  let initialResults: PortfolioResult[] | null = null;
  try {
    initialResults = await fetchAll(
      DEFAULT_PORTFOLIOS, DEFAULT_START_DATE, endDate, DEFAULT_CURRENCY,
      AbortSignal.timeout(PREFETCH_TIMEOUT_MS)
    );
  } catch (err) {
    if (!canFallBackWithoutData()) {
      throw new Error('Prefetching default portfolios failed; keeping the previous page', { cause: err });
    }
    console.error('Prefetching default portfolios failed:', err);
  }

  return <PortfolioPlayground initialResults={initialResults} initialEndDate={endDate} />;
}
