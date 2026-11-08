'use client';

import { useState } from 'react';
import { PortfolioStats } from '@/lib/api';
import { getPortfolioColor } from '@/lib/colors';
import { formatPercent } from '@/lib/formatting';

const METRIC_DEFINITIONS: Record<string, string> = {
  'Total Return': 'The overall gain or loss of an investment over the selected period, including capital appreciation and dividends, expressed as a percentage.',
  'Annualized Return': 'The geometric average yearly return. It shows what annual return would produce the same total return if compounded each year.',
  'Volatility': 'A measure of risk based on the standard deviation of returns. Higher volatility means larger price swings and greater uncertainty.',
  'Sharpe Ratio': 'Risk-adjusted return: (portfolio return − risk-free rate) ÷ volatility. Uses 3-month T-bill rate as risk-free rate. Falls back to 5% annual rate if T-bill data is unavailable. Higher is better.',
  'Max Drawdown': 'The largest peak-to-trough decline during the period. It shows the worst-case loss an investor could have experienced.',
};

const COLUMNS: { term: string; short?: string; tooltipClassName?: string }[] = [
  { term: 'Total Return', short: 'Total Ret.' },
  { term: 'Annualized Return', short: 'Ann. Return' },
  { term: 'Volatility' },
  { term: 'Sharpe Ratio', short: 'Sharpe' },
  { term: 'Max Drawdown', short: 'Max DD', tooltipClassName: 'info-tooltip-right' },
];

interface InfoTooltipProps {
  term: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  tooltipClassName?: string;
}

function InfoTooltip({ term, isOpen, onOpen, onClose, tooltipClassName }: InfoTooltipProps) {
  return (
    <span
      className="info-tooltip-wrapper"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <span className="info-icon" aria-label={`Info about ${term}`}>
        ⓘ
      </span>
      {isOpen && (
        <div className={`info-tooltip${tooltipClassName ? ` ${tooltipClassName}` : ''}`}>
          <div className="info-tooltip-content">
            <strong>{term}</strong>
            <p>{METRIC_DEFINITIONS[term]}</p>
          </div>
        </div>
      )}
    </span>
  );
}

interface StatsTableProps {
  stats: PortfolioStats[];
  onHighlight?: (index: number | null) => void;
}

export default function StatsTable({ stats, onHighlight }: StatsTableProps) {
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  return (
    <div className="stats-table-container">
      <h3>Portfolio Statistics</h3>
      <table className="stats-table">
        <thead>
          <tr>
            <th>Portfolio</th>
            {COLUMNS.map(({ term, short, tooltipClassName }) => (
              <th key={term}>
                {short ? (
                  <>
                    <span className="header-full">{term}</span><span className="header-short">{short}</span>
                  </>
                ) : term}
                <InfoTooltip
                  term={term}
                  isOpen={openTooltip === term}
                  onOpen={() => setOpenTooltip(term)}
                  onClose={() => setOpenTooltip(null)}
                  tooltipClassName={tooltipClassName}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.length > 0 ? (
            stats.map((s, index) => {
              const color = getPortfolioColor(index);

              return (
                <tr
                  key={s.name}
                  className="stats-row"
                  style={{
                    borderLeft: `4px solid ${color}`,
                    backgroundColor: `${color}08`,
                  }}
                  onMouseEnter={() => onHighlight?.(index)}
                  onMouseLeave={() => onHighlight?.(null)}
                >
                  <td className="portfolio-name">{s.name}</td>
                  <td className={s.total_return >= 0 ? 'positive' : 'negative'}>
                    <span className={`stat-pill ${s.total_return >= 0 ? 'positive' : 'negative'}`}>
                      {formatPercent(s.total_return)}
                    </span>
                  </td>
                  <td className={s.annualized_return >= 0 ? 'positive' : 'negative'}>
                    <span className={`stat-pill ${s.annualized_return >= 0 ? 'positive' : 'negative'}`}>
                      {formatPercent(s.annualized_return)}
                    </span>
                  </td>
                  <td><span className="stat-pill">{formatPercent(s.volatility)}</span></td>
                  <td className={s.sharpe_ratio >= 1 ? 'good' : ''}>
                    <span className={`stat-pill${s.sharpe_ratio >= 1 ? ' positive' : ''}`}>
                      {s.sharpe_ratio.toFixed(2)}
                    </span>
                  </td>
                  <td className="negative">
                    <span className="stat-pill negative">
                      {formatPercent(s.max_drawdown)}
                    </span>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={6} className="empty-row">
                No portfolios selected
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
