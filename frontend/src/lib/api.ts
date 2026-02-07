const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type CurrencyCode = 'AUD' | 'CAD' | 'CHF' | 'CNY' | 'EUR' | 'GBP' | 'JPY' | 'SGD' | 'USD';

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  flag: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'AUD', name: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'CAD', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'CHF', name: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', flag: '🇬🇧' },
  { code: 'JPY', name: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'SGD', name: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸' },
];

export const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  SGD: 'Singapore Dollar',
  USD: 'US Dollar',
};

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
  currency: CurrencyCode;
}

async function fetchFromAPI<T>(
  endpoint: string,
  options: RequestInit,
  errorMessage: string
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || errorMessage);
  }

  return response.json();
}

export async function analyzePortfolio(
  portfolio: Portfolio,
  startDate: string,
  endDate: string,
  riskFreeRate: number = 0.05,
  currency: CurrencyCode = 'USD'
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
        risk_free_rate: riskFreeRate,
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
  riskFreeRate: number = 0.05
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
        risk_free_rate: riskFreeRate,
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
