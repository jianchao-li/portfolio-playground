import PortfolioPlayground from './PortfolioPlayground';
import SiteGuide from '@/components/SiteGuide';
import JsonLd, { homeGraph } from '@/components/JsonLd';
import { DEFAULT_PORTFOLIOS, DEFAULT_START_DATE, todayISO } from '@/lib/portfolios';
import { prefetchView } from '@/lib/prefetch';

// Re-render (and re-fetch the default portfolios) at most once an hour.
// Visitors get the cached page instantly, so they never wait on the backend
// for the first paint, even when Render is cold.
export const revalidate = 3600;

export default async function Page() {
  const endDate = todayISO();
  const prefetched = await prefetchView(DEFAULT_PORTFOLIOS, DEFAULT_START_DATE, endDate, 'none');

  return (
    <>
      <JsonLd data={homeGraph()} />
      <PortfolioPlayground
        initialResults={prefetched?.results ?? null}
        initialAlignedStart={prefetched?.alignedStart ?? null}
        initialEndDate={endDate}
      >
        <SiteGuide />
      </PortfolioPlayground>
    </>
  );
}
