import { AnalysisResponse, Asset, PerformanceData, PortfolioStats, Rebalance, comparePortfolios } from '@/lib/api';

export const DEFAULT_START_DATE = '2023-01-01';
export const DEFAULT_CURRENCY = 'USD';

// Preset portfolios for quick comparison
export const PRESET_PORTFOLIOS: { name: string; assets: Asset[]; default?: boolean }[] = [
  {
    name: 'S&P 500',
    assets: [{ symbol: 'VOO', weight: 1.0 }],
    default: true,
  },
  {
    name: 'NASDAQ 100',
    assets: [{ symbol: 'QQQ', weight: 1.0 }],
  },
  {
    name: 'Developed Markets ex-US',
    assets: [{ symbol: 'VEA', weight: 1.0 }],
    default: true,
  },
  {
    name: 'Emerging Markets',
    assets: [{ symbol: 'VWO', weight: 1.0 }],
    default: true,
  },
  {
    name: 'Gold',
    assets: [{ symbol: 'GLD', weight: 1.0 }],
  },
  {
    name: 'Bitcoin',
    assets: [{ symbol: 'IBIT', weight: 1.0 }],
  },
  {
    name: 'Volatility',
    assets: [{ symbol: 'VIXY', weight: 1.0 }],
  },
];

export interface PortfolioResult {
  name: string;
  /** The assets as the user entered them (the source of truth for edits and links). */
  assets: Asset[];
  stats: PortfolioStats;
  performance: PerformanceData;
  /** Trading currency per symbol, from the backend (null if unknown). */
  currencies: Record<string, string | null>;
  /** First/last date with data in the requested range, before any alignment. */
  dataStart: string;
  dataEnd: string;
}

export type PortfolioInput = Pick<PortfolioResult, 'name' | 'assets'>;

export const DEFAULT_PORTFOLIOS = PRESET_PORTFOLIOS.filter((p) => p.default);

/** Today's date (UTC) as YYYY-MM-DD. */
export const todayISO = () => new Date().toISOString().split('T')[0];

/**
 * Combine a portfolio as entered with the backend's analysis. The user's own
 * `assets` are kept; from the backend's normalized copy only the per-symbol
 * trading currency is taken.
 */
export function toResult(input: PortfolioInput, response: AnalysisResponse): PortfolioResult {
  const currencies: Record<string, string | null> = {};
  for (const a of response.assets ?? []) currencies[a.symbol] = a.currency;
  return {
    name: input.name,
    assets: input.assets,
    stats: response.stats,
    performance: response.performance,
    currencies,
    dataStart: response.data_start,
    dataEnd: response.data_end,
  };
}

export interface ComparisonResult {
  results: PortfolioResult[];
  /** Date all portfolios were clipped to (align start dates), or null. */
  alignedStart: string | null;
}

export async function fetchComparison(
  portfolios: PortfolioInput[],
  startDate: string,
  endDate: string,
  currency: string,
  signal?: AbortSignal,
  alignStart = false,
  rebalance: Rebalance = 'none'
): Promise<ComparisonResult> {
  const inputs = portfolios.map(({ name, assets }) => ({ name, assets }));
  const response = await comparePortfolios(inputs, startDate, endDate, currency, signal, alignStart, rebalance);
  return {
    results: response.portfolios.map((r, i) => toResult(inputs[i], r)),
    alignedStart: response.aligned_start ?? null,
  };
}

export async function fetchAll(
  portfolios: PortfolioInput[],
  startDate: string,
  endDate: string,
  currency: string,
  signal?: AbortSignal
): Promise<PortfolioResult[]> {
  return (await fetchComparison(portfolios, startDate, endDate, currency, signal)).results;
}
