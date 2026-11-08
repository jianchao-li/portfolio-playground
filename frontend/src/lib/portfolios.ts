import { Asset, PerformanceData, PortfolioStats, comparePortfolios } from '@/lib/api';

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
  assets: Asset[];
  stats: PortfolioStats;
  performance: PerformanceData;
}

export type PortfolioInput = Pick<PortfolioResult, 'name' | 'assets'>;

export const DEFAULT_PORTFOLIOS = PRESET_PORTFOLIOS.filter((p) => p.default);

/** Today's date (UTC) as YYYY-MM-DD. */
export const todayISO = () => new Date().toISOString().split('T')[0];

export async function fetchAll(
  portfolios: PortfolioInput[],
  startDate: string,
  endDate: string,
  currency: string,
  signal?: AbortSignal
): Promise<PortfolioResult[]> {
  const inputs = portfolios.map(({ name, assets }) => ({ name, assets }));
  const response = await comparePortfolios(inputs, startDate, endDate, currency, signal);
  return response.portfolios.map((r, i) => ({
    name: inputs[i].name,
    assets: inputs[i].assets,
    stats: r.stats,
    performance: r.performance,
  }));
}
