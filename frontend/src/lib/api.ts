const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
}

export async function analyzePortfolio(
  portfolio: Portfolio,
  startDate: string,
  endDate: string,
  riskFreeRate: number = 0.05
): Promise<AnalysisResponse> {
  const response = await fetch(`${API_BASE}/api/portfolio/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portfolio,
      start_date: startDate,
      end_date: endDate,
      risk_free_rate: riskFreeRate,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to analyze portfolio');
  }

  return response.json();
}

export async function comparePortfolios(
  portfolios: Portfolio[],
  startDate: string,
  endDate: string,
  riskFreeRate: number = 0.05
): Promise<{ portfolios: AnalysisResponse[] }> {
  const response = await fetch(`${API_BASE}/api/portfolio/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portfolios,
      start_date: startDate,
      end_date: endDate,
      risk_free_rate: riskFreeRate,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to compare portfolios');
  }

  return response.json();
}
