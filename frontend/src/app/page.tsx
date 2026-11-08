'use client';

import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import PortfolioBuilder from '@/components/PortfolioBuilder';
import PortfolioPopover from '@/components/PortfolioPopover';
import CurrencySelector from '@/components/CurrencySelector';
import InsightsPanel from '@/components/InsightsPanel';
import { ChartSkeleton, TableSkeleton } from '@/components/LoadingSkeletons';
import { Asset, PortfolioStats, PerformanceData, CurrencyInfo, analyzePortfolio, comparePortfolios, fetchCurrencies } from '@/lib/api';
import { getPortfolioColor } from '@/lib/colors';

// Lazy load heavy chart components
const PerformanceChart = lazy(() => import('@/components/PerformanceChart'));
const StatsTable = lazy(() => import('@/components/StatsTable'));

// Preset portfolios for quick comparison
const PRESET_PORTFOLIOS: { name: string; assets: Asset[]; default?: boolean }[] = [
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

interface PortfolioResult {
  name: string;
  assets: Asset[];
  stats: PortfolioStats;
  performance: PerformanceData;
}

type PortfolioInput = Pick<PortfolioResult, 'name' | 'assets'>;

const chipStyle = (color: string) => ({
  borderColor: color,
  background: `linear-gradient(135deg, ${color}15, ${color}08)`,
  color,
  boxShadow: `0 2px 8px ${color}25`,
});

async function fetchAll(
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

export default function Home() {
  const [results, setResults] = useState<PortfolioResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('2023-01-01');
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [currency, setCurrency] = useState('USD');
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>([
    { code: 'USD', name: 'US Dollar', flag: '\u{1F1FA}\u{1F1F8}' },
  ]);
  const [showModal, setShowModal] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [editingPortfolio, setEditingPortfolio] = useState<PortfolioResult | null>(null);

  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const hasLoadedInitial = useRef(false);
  const resultsRef = useRef<PortfolioResult[]>([]);
  const analyzeControllerRef = useRef<AbortController | null>(null);

  // Keep ref in sync with results state
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // Fetch supported currencies from backend
  useEffect(() => {
    fetchCurrencies()
      .then(setCurrencies)
      .catch(() => {});
  }, []);

  // Generate next available portfolio name
  const getNextPortfolioName = () => {
    let n = 1;
    while (results.some(r => r.name === `Portfolio ${n}`)) {
      n++;
    }
    return `Portfolio ${n}`;
  };

  const openAddModal = () => {
    setNewPortfolioName(getNextPortfolioName());
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPortfolio(null);
  };

  const handleAnalyze = async (name: string, assets: Asset[]) => {
    analyzeControllerRef.current?.abort();
    const controller = new AbortController();
    analyzeControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const response = await analyzePortfolio(
        { name, assets },
        startDate,
        endDate,
        currency,
        controller.signal
      );

      // Add to results (or replace if same name exists), including assets
      setResults((prev) => {
        const filtered = prev.filter((r) => r.name !== name);
        return [...filtered, { name, assets, ...response }];
      });
      closeModal();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const renderPopover = (r: PortfolioResult) => (
    <PortfolioPopover
      name={r.name}
      assets={r.assets}
      onEdit={() => handleEditClick(r)}
      onRemove={() => removePortfolio(r.name)}
    />
  );

  const addPreset = async (preset: PortfolioInput) => {
    if (results.some((r) => r.name === preset.name)) {
      return;
    }
    await handleAnalyze(preset.name, preset.assets);
  };

  const removePortfolio = (name: string) => {
    setResults((prev) => prev.filter((r) => r.name !== name));
    setOpenPopover(null);
  };

  const handleEditClick = (portfolio: PortfolioResult) => {
    setOpenPopover(null);
    setEditingPortfolio(portfolio);
  };

  // Auto-load all preset portfolios on mount
  useEffect(() => {
    if (!hasLoadedInitial.current) {
      hasLoadedInitial.current = true;
      const loadAllPresets = async () => {
        setLoading(true);
        setError(null);
        try {
          const allResults = await fetchAll(
            PRESET_PORTFOLIOS.filter((p) => p.default), startDate, endDate, currency
          );
          setResults(allResults);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load portfolios');
        } finally {
          setLoading(false);
        }
      };
      loadAllPresets();
    }
  }, []);

  // Re-fetch all portfolios when date range or currency changes
  useEffect(() => {
    const currentResults = resultsRef.current;
    if (!hasLoadedInitial.current || currentResults.length === 0) {
      return;
    }

    const controller = new AbortController();

    const refreshPortfolios = async () => {
      setLoading(true);
      setError(null);

      try {
        const refreshedResults = await fetchAll(
          currentResults, startDate, endDate, currency, controller.signal
        );
        setResults(refreshedResults);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    refreshPortfolios();
    return () => controller.abort();
  }, [startDate, endDate, currency]);

  const chartData = useMemo(() => results.map((r) => ({
    name: r.name,
    performance: r.performance,
  })), [results]);

  const statsData = useMemo(() => results.map((r) => r.stats), [results]);

  return (
    <div className="container">
      <div className="top-card">
        {/* Row 1: Title left + Controls right */}
        <div className="top-card-row1">
          <div className="top-card-title">
            <h1>Portfolio Playground</h1>
            <div className="header-subtitle">
              <span>Build, analyze, and compare investment portfolios</span>
              <a className="header-link header-link-about" href="https://jianchao.xyz/projects/portfolio-playground/" target="_blank" rel="noopener noreferrer">⭐ About</a>
              <a className="header-link header-link-source" href="https://github.com/jianchao-li/portfolio-playground" target="_blank" rel="noopener noreferrer">Source Code</a>
              <span
                className="disclaimer-wrapper"
                onMouseEnter={() => setShowDisclaimer(true)}
                onMouseLeave={() => setShowDisclaimer(false)}
              >
                <span className="disclaimer-link">Disclaimer (please read)</span>
                {showDisclaimer && (
                  <div className="disclaimer-tooltip">
                    <div className="disclaimer-tooltip-content">
                      <strong>Disclaimer</strong>
                      <span>For informational and educational purposes only — not financial advice. The author is not a financial advisor, and use of this tool does not create an advisory relationship. Data may be inaccurate, delayed, or incomplete. The author assumes no liability for any losses or damages arising from reliance on information provided. Consult a qualified financial professional before making investment decisions.</span>
                    </div>
                  </div>
                )}
              </span>
            </div>
          </div>
          <div className="top-card-controls">
            <div className="date-inputs">
              <div className="date-field">
                <label>Start</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="date-field">
                <label>End</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <CurrencySelector
                value={currency}
                onChange={setCurrency}
                disabled={loading}
                currencies={currencies}
              />
            </div>
          </div>
        </div>

        {/* Row 2: Portfolio chips */}
        <div className="top-card-row2">
          <div className="portfolio-chips-custom">
            <button
              onClick={openAddModal}
              className="add-custom-btn"
            >
              + Custom Portfolio
            </button>

            {/* Custom portfolios (not matching any preset) */}
            {results
              .filter((r) => !PRESET_PORTFOLIOS.some((p) => p.name === r.name))
              .map((r) => {
                const resultIndex = results.findIndex((res) => res.name === r.name);
                const color = getPortfolioColor(resultIndex);
                return (
                  <div
                    key={r.name}
                    className="portfolio-chip-wrapper"
                    onMouseEnter={() => setOpenPopover(r.name)}
                    onMouseLeave={() => setOpenPopover(null)}
                  >
                    <span
                      className="portfolio-chip-unified active"
                      style={chipStyle(color)}
                    >
                      <span
                        className="chip-name"
                        onClick={() => handleEditClick(r)}
                      >
                        {r.name}
                      </span>
                      <button
                        className="chip-remove"
                        onClick={() => removePortfolio(r.name)}
                        style={{ color: color }}
                        aria-label={`Remove ${r.name}`}
                      >
                        ×
                      </button>
                    </span>
                    {openPopover === r.name && renderPopover(r)}
                  </div>
                );
              })}
          </div>

          <div className="portfolio-chips-right">
          <span className="preset-label">Presets:</span>
          {PRESET_PORTFOLIOS.map((preset) => {
            const resultIndex = results.findIndex((r) => r.name === preset.name);
            const isActive = resultIndex !== -1;

            if (isActive) {
              const r = results[resultIndex];
              return (
                <div
                  key={preset.name}
                  className="portfolio-chip-wrapper"
                  onMouseEnter={() => setOpenPopover(r.name)}
                  onMouseLeave={() => setOpenPopover(null)}
                >
                  <button
                    onClick={() => removePortfolio(preset.name)}
                    disabled={loading}
                    className="portfolio-chip-unified active"
                    style={chipStyle(getPortfolioColor(resultIndex))}
                  >
                    ✓ {preset.name}
                  </button>
                  {openPopover === r.name && renderPopover(r)}
                </div>
              );
            }

            return (
              <div
                key={preset.name}
                className="portfolio-chip-wrapper"
                onMouseEnter={() => setOpenPopover(preset.name)}
                onMouseLeave={() => setOpenPopover(null)}
              >
                <button
                  onClick={() => addPreset(preset)}
                  disabled={loading}
                  className="portfolio-chip-unified inactive"
                >
                  + {preset.name}
                </button>
                {openPopover === preset.name && (
                  <PortfolioPopover
                    name={preset.name}
                    assets={preset.assets}
                  />
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && <div className="error-message">{error}</div>}

      {/* Performance Chart & Statistics Table */}
      <div className="results-row">
        <div className="results-card results-card-chart" style={{ position: 'relative' }}>
          {loading && results.length > 0 && (
            <div className="results-loading-overlay">
              <span className="results-loading-indicator">Loading…</span>
            </div>
          )}
          <Suspense fallback={<ChartSkeleton />}>
            <PerformanceChart
              data={chartData}
              currency={currency}
              currencies={currencies}
              highlightedIndex={highlightedIndex}
            />
          </Suspense>
        </div>

        <div className="results-card results-card-table">
          <Suspense fallback={<TableSkeleton />}>
            <StatsTable
              stats={statsData}
              onHighlight={setHighlightedIndex}
            />
          </Suspense>
        </div>
      </div>

      {/* AI Insights Panel */}
      <div className="insights-row">
        <InsightsPanel portfolios={statsData} />
      </div>

      {/* Modal for Custom/Edit Portfolio */}
      {(showModal || editingPortfolio) && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPortfolio ? 'Edit Portfolio' : 'Add Custom Portfolio'}</h2>
              <button className="modal-close" aria-label="Close" onClick={closeModal}>
                ×
              </button>
            </div>
            <PortfolioBuilder
              onSubmit={handleAnalyze}
              loading={loading}
              initialName={editingPortfolio?.name ?? newPortfolioName}
              initialAssets={editingPortfolio?.assets}
              submitLabel={editingPortfolio ? 'Update Portfolio' : undefined}
            />
          </div>
        </div>
      )}

      {/* Full-page loading overlay for first load */}
      {loading && results.length === 0 && (
        <div className="loading-overlay">
          <div className="loading-card">
            <div className="loading-spinner" />
            <p className="loading-text">Fetching market data</p>
            <p className="loading-subtext">First load may take a moment</p>
          </div>
        </div>
      )}

      <footer className="copyright">
        © 2026 Jianchao Li
      </footer>
    </div>
  );
}
