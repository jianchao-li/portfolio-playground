const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface CurrencyInfo {
  code: string;
  name: string;
  flag: string;
}

export interface Asset {
  symbol: string;
  weight: number;
}

export interface Portfolio {
  name: string;
  assets: Asset[];
}

export interface PortfolioStats {
  name: string;
  total_return: number;
  annualized_return: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
}

export interface PerformanceData {
  dates: string[];
  values: number[];
}

export interface AnalysisResponse {
  stats: PortfolioStats;
  performance: PerformanceData;
  currency: string;
}

async function fetchFromAPI<T>(
  endpoint: string,
  options: RequestInit,
  errorMessage: string
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, options);
  } catch {
    throw new Error('Unable to reach the server. Is the backend running?');
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

export async function fetchCurrencies(): Promise<CurrencyInfo[]> {
  return fetchFromAPI<CurrencyInfo[]>(
    '/api/portfolio/currencies',
    {},
    'Failed to fetch currencies'
  );
}

export async function analyzePortfolio(
  portfolio: Portfolio,
  startDate: string,
  endDate: string,
  currency: string = 'USD'
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
      }),
    },
    'Failed to analyze portfolio'
  );
}

export async function comparePortfolios(
  portfolios: Portfolio[],
  startDate: string,
  endDate: string,
  currency: string = 'USD'
): Promise<{ portfolios: AnalysisResponse[] }> {
  return fetchFromAPI<{ portfolios: AnalysisResponse[] }>(
    '/api/portfolio/compare',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios,
        start_date: startDate,
        end_date: endDate,
        currency,
      }),
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
