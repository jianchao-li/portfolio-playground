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

export default async function Page() {
  const endDate = todayISO();
  let initialResults: PortfolioResult[] | null = null;
  try {
    initialResults = await fetchAll(
      DEFAULT_PORTFOLIOS, DEFAULT_START_DATE, endDate, DEFAULT_CURRENCY,
      AbortSignal.timeout(PREFETCH_TIMEOUT_MS)
    );
  } catch (err) {
    // The client falls back to loading the defaults itself
    console.error('Prefetching default portfolios failed:', err);
  }

  return <PortfolioPlayground initialResults={initialResults} initialEndDate={endDate} />;
}
