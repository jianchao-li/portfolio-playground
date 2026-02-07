'use client';

import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import PortfolioBuilder from '@/components/PortfolioBuilder';
import PortfolioPopover from '@/components/PortfolioPopover';
import CurrencySelector from '@/components/CurrencySelector';
import { ChartSkeleton, TableSkeleton } from '@/components/LoadingSkeletons';
import { Asset, PortfolioStats, PerformanceData, analyzePortfolio, CurrencyCode } from '@/lib/api';
import { getPortfolioColor } from '@/lib/colors';

// Lazy load heavy chart components
const PerformanceChart = lazy(() => import('@/components/PerformanceChart'));
const StatsTable = lazy(() => import('@/components/StatsTable'));

// Preset portfolios for quick comparison
const PRESET_PORTFOLIOS = [
  {
    name: 'S&P 500',
    assets: [{ symbol: 'VTI', weight: 1.0 }] as Asset[],
  },
  {
    name: 'NASDAQ 100',
    assets: [{ symbol: 'QQQ', weight: 1.0 }] as Asset[],
  },
  {
    name: 'Developed Markets ex-US',
    assets: [{ symbol: 'VEA', weight: 1.0 }] as Asset[],
  },
  {
    name: 'Emerging Markets',
    assets: [{ symbol: 'VWO', weight: 1.0 }] as Asset[],
  },
  {
    name: 'Gold',
    assets: [{ symbol: 'GLD', weight: 1.0 }] as Asset[],
  },
  {
    name: 'Bitcoin',
    assets: [{ symbol: 'IBIT', weight: 1.0 }] as Asset[],
  },
  {
    name: 'Volatility',
    assets: [{ symbol: 'VIXY', weight: 1.0 }] as Asset[],
  },
];

interface PortfolioResult {
  name: string;
  assets: Asset[];
  stats: PortfolioStats;
  performance: PerformanceData;
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
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [showModal, setShowModal] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [editingPortfolio, setEditingPortfolio] = useState<PortfolioResult | null>(null);
  const [highlightedPortfolio, setHighlightedPortfolio] = useState<string | null>(null);
  const portfolioCounter = useRef(0);
  const hasLoadedInitial = useRef(false);
  const resultsRef = useRef<PortfolioResult[]>([]);

  // Keep ref in sync with results state
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // Generate next available portfolio name
  const getNextPortfolioName = () => {
    const name = `Portfolio ${portfolioCounter.current}`;
    portfolioCounter.current += 1;
    return name;
  };

  const openAddModal = () => {
    setNewPortfolioName(getNextPortfolioName());
    setShowModal(true);
  };

  const handleAnalyze = async (name: string, assets: Asset[]) => {
    setLoading(true);
    setError(null);

    try {
      const response = await analyzePortfolio(
        { name, assets },
        startDate,
        endDate,
        0.05,
        currency
      );

      // Add to results (or replace if same name exists), including assets
      setResults((prev) => {
        const filtered = prev.filter((r) => r.name !== name);
        return [...filtered, { name, assets, ...response }];
      });
      setShowModal(false);
      setEditingPortfolio(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const addPreset = async (preset: { name: string; assets: Asset[] }) => {
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
          const allResults = await Promise.all(
            PRESET_PORTFOLIOS.map(async (preset) => {
              const response = await analyzePortfolio(
                { name: preset.name, assets: preset.assets },
                startDate,
                endDate,
                0.05,
                currency
              );
              return { name: preset.name, assets: preset.assets, ...response };
            })
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

    const refreshPortfolios = async () => {
      setLoading(true);
      setError(null);

      try {
        const refreshedResults = await Promise.all(
          currentResults.map(async (r) => {
            const response = await analyzePortfolio(
              { name: r.name, assets: r.assets },
              startDate,
              endDate,
              0.05,
              currency
            );
            return { name: r.name, assets: r.assets, ...response };
          })
        );
        setResults(refreshedResults);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
      } finally {
        setLoading(false);
      }
    };

    refreshPortfolios();
  }, [startDate, endDate, currency]);

  return (
    <div className="container">
      <header>
        <h1>Portfolio Playground</h1>
        <p>Build, analyze, and compare investment portfolios</p>
      </header>

      {/* Settings Bar */}
      <div className="settings-bar">
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
          />
        </div>
      </div>

      {/* Portfolio Selector */}
      <div className="portfolio-selector">
        {PRESET_PORTFOLIOS.map((preset) => {
          const resultIndex = results.findIndex((r) => r.name === preset.name);
          const isActive = resultIndex !== -1;
          const color = isActive ? getPortfolioColor(resultIndex) : undefined;

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
                  style={{
                    borderColor: color,
                    backgroundColor: `${color}15`,
                    color: color,
                  }}
                >
                  ✓ {preset.name}
                </button>
                {openPopover === r.name && (
                  <PortfolioPopover
                    name={r.name}
                    assets={r.assets}
                    onEdit={() => handleEditClick(r)}
                    onRemove={() => removePortfolio(r.name)}
                    onClose={() => setOpenPopover(null)}
                  />
                )}
              </div>
            );
          }

          return (
            <button
              key={preset.name}
              onClick={() => addPreset(preset)}
              disabled={loading}
              className="portfolio-chip-unified inactive"
            >
              + {preset.name}
            </button>
          );
        })}

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
                  style={{
                    borderColor: color,
                    backgroundColor: `${color}15`,
                    color: color,
                  }}
                >
                  {r.name}
                  <button
                    className="chip-remove"
                    onClick={() => removePortfolio(r.name)}
                    style={{ color: color }}
                  >
                    ×
                  </button>
                </span>
                {openPopover === r.name && (
                  <PortfolioPopover
                    name={r.name}
                    assets={r.assets}
                    onEdit={() => handleEditClick(r)}
                    onRemove={() => removePortfolio(r.name)}
                    onClose={() => setOpenPopover(null)}
                  />
                )}
              </div>
            );
          })}

        <button
          onClick={openAddModal}
          className="add-custom-btn"
        >
          + Custom
        </button>
      </div>

      {/* Error Message */}
      {error && <div className="error-message">{error}</div>}

      {/* Full Width Results */}
      <div className="results-full" style={{ position: 'relative' }}>
        {loading && results.length > 0 && (
          <div className="results-loading-overlay">
            <span className="results-loading-indicator">Loading…</span>
          </div>
        )}
        <Suspense fallback={<ChartSkeleton />}>
          <PerformanceChart
            data={results.map((r) => ({
              name: r.name,
              performance: r.performance,
            }))}
            highlightedPortfolio={highlightedPortfolio}
            onPortfolioHover={setHighlightedPortfolio}
            currency={currency}
          />
        </Suspense>
        <Suspense fallback={<TableSkeleton />}>
          <StatsTable
            stats={results.map((r) => r.stats)}
            highlightedPortfolio={highlightedPortfolio}
            onPortfolioHover={setHighlightedPortfolio}
          />
        </Suspense>
      </div>

      {/* Modal for Custom/Edit Portfolio */}
      {(showModal || editingPortfolio) && (
        <div className="modal-overlay" onClick={() => {
          setShowModal(false);
          setEditingPortfolio(null);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPortfolio ? 'Edit Portfolio' : 'Add Custom Portfolio'}</h2>
              <button className="modal-close" onClick={() => {
                setShowModal(false);
                setEditingPortfolio(null);
              }}>
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
    </div>
  );
}
