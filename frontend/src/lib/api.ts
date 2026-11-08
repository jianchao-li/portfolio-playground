import { SUPPORTED_CURRENCIES } from '@/lib/currencies';
import { parseRetryAfter, rateLimitMessage } from '@/lib/errors';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface CurrencyInfo {
  code: string;
  name: string;
  flag: string;
}

export interface Asset {
  symbol: string;
  weight: number;
}

/** Rebalancing schedule; 'none' = buy-and-hold. */
export type Rebalance = 'none' | 'monthly' | 'quarterly' | 'annually';

export interface Portfolio {
  name: string;
  assets: Asset[];
}

export interface PortfolioStats {
  name: string;
  total_return: number;
  /** null when the range is too short to annualize meaningfully */
  annualized_return: number | null;
  volatility: number | null;
  sharpe_ratio: number | null;
  /** null when undefined (fewer than 2 returns, or none below the risk-free rate) */
  sortino_ratio: number | null;
  max_drawdown: number;
}

export interface PerformanceData {
  dates: string[];
  values: number[];
}

/** An asset as analyzed by the backend (symbol normalized, duplicates merged). */
export interface AssetInfo extends Asset {
  /**
   * Trading currency reported by Yahoo ("USD", "JPY", "GBp" = pence, ...), or
   * null if unknown. Prices are NOT converted from it yet.
   */
  currency: string | null;
}

export interface AnalysisResponse {
  stats: PortfolioStats;
  performance: PerformanceData;
  currency: string;
  assets: AssetInfo[];
  /** First/last date with data in the requested range, before any alignment (YYYY-MM-DD). */
  data_start: string;
  data_end: string;
}

export interface ComparisonResponse {
  portfolios: AnalysisResponse[];
  /** Date every portfolio was clipped to when align_start was requested and starts differed. */
  aligned_start: string | null;
}

async function fetchFromAPI<T>(
  endpoint: string,
  options: RequestInit,
  errorMessage: string
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, options);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new Error('Unable to reach the server. Is the backend running?');
  }

  if (response.status === 429) {
    // Rate limited (slowapi): say how long to wait instead of its raw message
    throw new Error(rateLimitMessage(parseRetryAfter(response.headers.get('Retry-After'))));
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const error = await response.json();
      detail = error.detail ?? error.error;
      if (Array.isArray(detail)) {
        detail = detail[0]?.msg?.replace(/^Value error, /, '') || errorMessage;
      }
    } catch {}
    throw new Error(detail || errorMessage);
  }

  return response.json();
}

/**
 * Supported currencies. Served from a constant bundled with the frontend
 * (see lib/currencies.ts), so it costs no request to the backend.
 */
export async function fetchCurrencies(): Promise<CurrencyInfo[]> {
  return [...SUPPORTED_CURRENCIES];
}

export async function analyzePortfolio(
  portfolio: Portfolio,
  startDate: string,
  endDate: string,
  currency: string = 'USD',
  signal?: AbortSignal,
  rebalance: Rebalance = 'none'
): Promise<AnalysisResponse> {
  return fetchFromAPI<AnalysisResponse>(
    '/api/portfolio/analyze',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio,
        start_date: startDate,
        end_date: endDate,
        currency,
        rebalance,
      }),
      signal,
    },
    'Failed to analyze portfolio'
  );
}

export async function comparePortfolios(
  portfolios: Portfolio[],
  startDate: string,
  endDate: string,
  currency: string = 'USD',
  signal?: AbortSignal,
  alignStart = false,
  rebalance: Rebalance = 'none'
): Promise<ComparisonResponse> {
  return fetchFromAPI<ComparisonResponse>(
    '/api/portfolio/compare',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios,
        start_date: startDate,
        end_date: endDate,
        currency,
        align_start: alignStart,
        rebalance,
      }),
      signal,
    },
    'Failed to compare portfolios'
  );
}

export interface SymbolResult {
  symbol: string;
  name: string | null;
  type: string | null;
  exchange: string | null;
}

export class SymbolSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SymbolSearchError';
  }
}

export async function searchSymbols(query: string): Promise<SymbolResult[]> {
  if (!query.trim()) {
    return [];
  }

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE}/api/portfolio/symbols/search?q=${encodeURIComponent(query)}`
    );
  } catch (error) {
    throw new SymbolSearchError('Network error: Unable to reach the server');
  }

  if (!response.ok) {
    if (response.status === 504) {
      throw new SymbolSearchError('Search timed out. Please try again.');
    } else if (response.status >= 500) {
      throw new SymbolSearchError('Search service is temporarily unavailable');
    }
    throw new SymbolSearchError('Failed to search symbols');
  }

  return response.json();
}
