'use client';

import React, { useMemo, useState } from 'react';
import { useLLM, PortfolioData } from '@/hooks/useLLM';
import { PortfolioStats } from '@/lib/api';

interface InsightsPanelProps {
  portfolios: PortfolioStats[];
}

export default function InsightsPanel({ portfolios }: InsightsPanelProps) {
  const {
    status,
    progress,
    output,
    error,
    supportsWebGPU,
    init,
    generate,
    reset,
  } = useLLM();

  // Convert PortfolioStats[] to PortfolioData[]
  const portfolioData: PortfolioData[] = useMemo(() => {
    return portfolios.map(p => ({
      name: p.name,
      total_return: p.total_return,
      annualized_return: p.annualized_return,
      volatility: p.volatility,
      sharpe_ratio: p.sharpe_ratio,
      max_drawdown: p.max_drawdown,
    }));
  }, [portfolios]);

  const handleGenerate = () => {
    if (portfolioData.length > 0) {
      reset();
      generate(portfolioData);
    }
  };

  // Generate display text for portfolios being analyzed
  const portfolioNames = useMemo(() => {
    if (portfolios.length === 0) return '';
    if (portfolios.length === 1) return portfolios[0].name;
    if (portfolios.length <= 3) {
      return portfolios.map(p => p.name).join(', ');
    }
    return `${portfolios.length} portfolios`;
  }, [portfolios]);

  const isComparison = portfolios.length > 1;
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Still checking WebGPU support
  if (supportsWebGPU === null) {
    return null;
  }

  // WebGPU not supported
  if (!supportsWebGPU) {
    return (
      <div className="insights-panel insights-unsupported">
        <div className="insights-header">
          <h3>AI Analysis</h3>
        </div>
        <div className="insights-content">
          <p className="insights-unsupported-text">
            AI analysis requires a WebGPU-enabled browser (Chrome 113+, Edge 113+, or Firefox 118+).
          </p>
        </div>
      </div>
    );
  }

  // No portfolios loaded - but still show loading progress if model is loading
  if (portfolios.length === 0) {
    return (
      <div className="insights-panel">
        <div className="insights-header">
          <h3>AI Analysis</h3>
          {status === 'ready' && <span className="insights-badge">Local LLM</span>}
        </div>
        <div className="insights-content">
          {status === 'loading' ? (
            <div className="insights-loading">
              <div className="insights-progress-bar">
                <div
                  className="insights-progress-fill"
                  style={{ width: `${progress.progress * 100}%` }}
                />
              </div>
              <p className="insights-progress-text">{progress.text}</p>
            </div>
          ) : status === 'ready' ? (
            <p className="insights-empty">Add portfolios to generate AI analysis</p>
          ) : status === 'error' ? (
            <div className="insights-error">
              <p>{error || 'Failed to load model'}</p>
              <button onClick={init} className="insights-btn insights-btn-secondary">
                Retry
              </button>
            </div>
          ) : (
            <p className="insights-empty">Add portfolios to generate AI analysis</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="insights-panel">
      <div className="insights-header">
        <div className="insights-title-row">
          <h3>AI Analysis</h3>
          <span
            className="insights-info-wrapper"
            onMouseEnter={() => setShowDisclaimer(true)}
            onMouseLeave={() => setShowDisclaimer(false)}
            onClick={() => setShowDisclaimer(!showDisclaimer)}
          >
            <span className="insights-info-icon">i</span>
            {showDisclaimer && (
              <div className="insights-info-tooltip">
                AI-generated analysis may be inaccurate or incorrect. Always verify with the actual data.
              </div>
            )}
          </span>
        </div>
        <span className="insights-badge">Local LLM</span>
      </div>

      <div className="insights-content">
        {/* Ready state without output - show generate button */}
        {status === 'ready' && !output && (
          <div className="insights-idle">
            <p className="insights-description">
              {isComparison ? 'Compare' : 'Analyze'}: {portfolioNames}
            </p>
            <button onClick={handleGenerate} className="insights-btn insights-btn-primary">
              {isComparison ? 'Compare Portfolios' : 'Generate Analysis'}
            </button>
          </div>
        )}

        {/* Loading state - show progress */}
        {status === 'loading' && (
          <div className="insights-loading">
            <div className="insights-progress-bar">
              <div
                className="insights-progress-fill"
                style={{ width: `${progress.progress * 100}%` }}
              />
            </div>
            <p className="insights-progress-text">{progress.text}</p>
          </div>
        )}

        {/* Generating state - show spinner and streaming output */}
        {status === 'generating' && (
          <div className="insights-generating">
            <div className="insights-spinner-row">
              <div className="insights-spinner" />
              <span>{isComparison ? 'Comparing' : 'Analyzing'} {portfolioNames}...</span>
            </div>
            {output && (
              <div className="insights-summary">
                <p>{output}</p>
              </div>
            )}
          </div>
        )}

        {/* Output with regenerate button */}
        {status === 'ready' && output && (
          <div className="insights-result">
            <p className="insights-target">
              {isComparison ? 'Comparing' : 'Analyzing'}: <strong>{portfolioNames}</strong>
            </p>
            <div className="insights-summary">
              <p>{output}</p>
            </div>
            <button onClick={handleGenerate} className="insights-btn insights-btn-secondary">
              Regenerate
            </button>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="insights-error">
            <p>{error || 'An error occurred'}</p>
            <button onClick={init} className="insights-btn insights-btn-secondary">
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
