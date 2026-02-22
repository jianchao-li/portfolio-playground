'use client';

import React, { useMemo } from 'react';
import { useLLM, PortfolioData } from '@/hooks/useLLM';
import { PortfolioStats, Asset } from '@/lib/api';

interface InsightsPanelProps {
  stats: PortfolioStats | null;
  holdings: Asset[];
}

export default function InsightsPanel({ stats, holdings }: InsightsPanelProps) {
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

  const portfolioData: PortfolioData | null = useMemo(() => {
    if (!stats) return null;
    return {
      name: stats.name,
      total_return: stats.total_return,
      annualized_return: stats.annualized_return,
      volatility: stats.volatility,
      sharpe_ratio: stats.sharpe_ratio,
      max_drawdown: stats.max_drawdown,
      holdings: holdings,
    };
  }, [stats, holdings]);

  const handleGenerate = () => {
    if (portfolioData) {
      reset();
      generate(portfolioData);
    }
  };

  // Render inline markdown (bold text)
  const renderInlineMarkdown = (text: string, keyPrefix: string): React.ReactNode => {
    // Split by **bold** patterns
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={`${keyPrefix}-${idx}`}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  // Format the output with simple markdown-like rendering
  const formattedOutput = useMemo(() => {
    if (!output) return null;

    // Split into lines and process
    const lines = output.split('\n');
    const elements: JSX.Element[] = [];

    lines.forEach((line, i) => {
      const trimmed = line.trim();

      // Check for header pattern: **Text**: or **Text**
      const headerMatch = trimmed.match(/^\*\*([^*]+)\*\*:?$/);
      if (headerMatch) {
        elements.push(
          <h4 key={i} className="insights-heading">
            {headerMatch[1]}
          </h4>
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        // Bullet points (dash or bullet character)
        const bulletText = trimmed.substring(2);
        elements.push(
          <li key={i} className="insights-bullet">
            {renderInlineMarkdown(bulletText, `li-${i}`)}
          </li>
        );
      } else if (trimmed) {
        // Regular paragraph with inline markdown
        elements.push(
          <p key={i} className="insights-paragraph">
            {renderInlineMarkdown(trimmed, `p-${i}`)}
          </p>
        );
      }
    });

    return elements;
  }, [output]);

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

  // No portfolio selected
  if (!stats) {
    return (
      <div className="insights-panel">
        <div className="insights-header">
          <h3>AI Analysis</h3>
        </div>
        <div className="insights-content">
          <p className="insights-empty">Select a portfolio to generate AI analysis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="insights-panel">
      <div className="insights-header">
        <h3>AI Analysis</h3>
        <span className="insights-badge">Local LLM</span>
      </div>

      <div className="insights-content">
        {/* Idle state - show load button */}
        {status === 'idle' && (
          <div className="insights-idle">
            <p className="insights-description">
              Run AI analysis locally in your browser. The model (~200MB) will be downloaded once and cached.
            </p>
            <button onClick={init} className="insights-btn insights-btn-primary">
              Load AI Model
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

        {/* Ready state - show generate button */}
        {status === 'ready' && !output && (
          <div className="insights-ready">
            <p className="insights-target">
              Analyzing: <strong>{stats.name}</strong>
            </p>
            <button onClick={handleGenerate} className="insights-btn insights-btn-primary">
              Generate Analysis
            </button>
          </div>
        )}

        {/* Generating state - show spinner and streaming output */}
        {status === 'generating' && (
          <div className="insights-generating">
            <div className="insights-spinner-row">
              <div className="insights-spinner" />
              <span>Analyzing {stats.name}...</span>
            </div>
            {output && (
              <div className="insights-output insights-output-streaming">
                {formattedOutput}
              </div>
            )}
          </div>
        )}

        {/* Output with regenerate button */}
        {status === 'ready' && output && (
          <div className="insights-result">
            <div className="insights-output">{formattedOutput}</div>
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
