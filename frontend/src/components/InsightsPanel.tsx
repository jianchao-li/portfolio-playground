'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLLM, LLMProgress, MODEL_DOWNLOAD_SIZE } from '@/hooks/useLLM';
import { PortfolioStats } from '@/lib/api';

function ProgressBar({ progress }: { progress: LLMProgress }) {
  return (
    <div className="insights-loading">
      <div className="insights-progress-bar">
        <div
          className="insights-progress-fill"
          style={{ width: `${progress.progress * 100}%` }}
        />
      </div>
      <p className="insights-progress-text">{progress.text}</p>
    </div>
  );
}

function DownloadNote() {
  return (
    <p className="insights-description">
      Runs a local AI model in your browser: a one-time {MODEL_DOWNLOAD_SIZE} download, cached for later visits.
    </p>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="insights-error">
      <p>{message}</p>
      <button onClick={onRetry} className="insights-btn insights-btn-secondary">
        Retry
      </button>
    </div>
  );
}

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

  const handleGenerate = () => {
    if (portfolios.length > 0) {
      reset();
      generate(portfolios);
    }
  };

  // First click on an unloaded model: download it, then generate once ready
  const generateWhenReady = useRef(false);
  const handleLoadAndGenerate = () => {
    generateWhenReady.current = true;
    init();
  };
  useEffect(() => {
    if (status === 'ready' && generateWhenReady.current) {
      generateWhenReady.current = false;
      handleGenerate();
    } else if (status === 'error') {
      generateWhenReady.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
          {status === 'idle' ? (
            <div className="insights-idle">
              <DownloadNote />
              <button onClick={init} className="insights-btn insights-btn-primary">
                Enable AI Analysis
              </button>
            </div>
          ) : status === 'loading' ? (
            <ProgressBar progress={progress} />
          ) : status === 'error' ? (
            <ErrorBox message={error || 'Failed to load model'} onRetry={init} />
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
        {/* Model not loaded yet - one click downloads it, then generates */}
        {status === 'idle' && (
          <div className="insights-idle">
            <p className="insights-description">
              {isComparison ? 'Compare' : 'Analyze'}: {portfolioNames}
            </p>
            <DownloadNote />
            <button onClick={handleLoadAndGenerate} className="insights-btn insights-btn-primary">
              {isComparison ? 'Compare Portfolios' : 'Generate Analysis'}
            </button>
          </div>
        )}

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
        {status === 'loading' && <ProgressBar progress={progress} />}

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
          <ErrorBox message={error || 'An error occurred'} onRetry={init} />
        )}
      </div>
    </div>
  );
}
