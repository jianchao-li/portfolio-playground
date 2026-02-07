'use client';

import { useState, useEffect, useRef } from 'react';
import PortfolioBuilder from '@/components/PortfolioBuilder';
import PerformanceChart from '@/components/PerformanceChart';
import StatsTable from '@/components/StatsTable';
import { Asset, PortfolioStats, PerformanceData, analyzePortfolio } from '@/lib/api';

// Default three-fund portfolio (Bogleheads)
const DEFAULT_PORTFOLIO = {
  name: 'Three-Fund Portfolio',
  assets: [
    { symbol: 'VTI', weight: 0.6 },
    { symbol: 'VXUS', weight: 0.2 },
    { symbol: 'BND', weight: 0.2 },
  ] as Asset[],
};

interface PortfolioResult {
  name: string;
  stats: PortfolioStats;
  performance: PerformanceData;
}

export default function Home() {
  const [results, setResults] = useState<PortfolioResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('2023-01-01');
  const [endDate, setEndDate] = useState('2024-01-01');
  const hasLoadedInitial = useRef(false);

  const handleAnalyze = async (name: string, assets: Asset[]) => {
    setLoading(true);
    setError(null);

    try {
      const response = await analyzePortfolio(
        { name, assets },
        startDate,
        endDate
      );

      // Add to results (or replace if same name exists)
      setResults((prev) => {
        const filtered = prev.filter((r) => r.name !== name);
        return [...filtered, { name, ...response }];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Auto-analyze default portfolio on mount
  useEffect(() => {
    if (!hasLoadedInitial.current) {
      hasLoadedInitial.current = true;
      handleAnalyze(DEFAULT_PORTFOLIO.name, DEFAULT_PORTFOLIO.assets);
    }
  }, []);

  const clearResults = () => {
    setResults([]);
  };

  return (
    <div className="container">
      <header>
        <h1>Portfolio Playground</h1>
        <p>Build, analyze, and compare investment portfolios</p>
      </header>

      <div className="main-content">
        <aside>
          <div className="form-group date-range">
            <div>
              <label>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <PortfolioBuilder onSubmit={handleAnalyze} loading={loading} />
          {results.length > 0 && (
            <button
              onClick={clearResults}
              style={{ marginTop: '1rem', width: '100%' }}
              className="add-btn"
            >
              Clear All Results
            </button>
          )}
        </aside>

        <section className="results">
          {error && <div className="error-message">{error}</div>}

          {results.length > 0 ? (
            <>
              <PerformanceChart
                data={results.map((r) => ({
                  name: r.name,
                  performance: r.performance,
                }))}
              />
              <StatsTable stats={results.map((r) => r.stats)} />
            </>
          ) : (
            <div className="placeholder">
              <p>Configure a portfolio and click &quot;Analyze&quot; to see results</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
