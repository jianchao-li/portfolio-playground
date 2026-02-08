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
            <th>
              <span className="header-full">Total Return</span><span className="header-short">Total Ret.</span>
              <InfoTooltip term="Total Return" isOpen={openTooltip === 'Total Return'} onOpen={() => setOpenTooltip('Total Return')} onClose={() => setOpenTooltip(null)} />
            </th>
            <th>
              <span className="header-full">Annualized Return</span><span className="header-short">Ann. Return</span>
              <InfoTooltip term="Annualized Return" isOpen={openTooltip === 'Annualized Return'} onOpen={() => setOpenTooltip('Annualized Return')} onClose={() => setOpenTooltip(null)} />
            </th>
            <th>
              Volatility
              <InfoTooltip term="Volatility" isOpen={openTooltip === 'Volatility'} onOpen={() => setOpenTooltip('Volatility')} onClose={() => setOpenTooltip(null)} />
            </th>
            <th>
              <span className="header-full">Sharpe Ratio</span><span className="header-short">Sharpe</span>
              <InfoTooltip term="Sharpe Ratio" isOpen={openTooltip === 'Sharpe Ratio'} onOpen={() => setOpenTooltip('Sharpe Ratio')} onClose={() => setOpenTooltip(null)} />
            </th>
            <th>
              <span className="header-full">Max Drawdown</span><span className="header-short">Max DD</span>
              <InfoTooltip term="Max Drawdown" isOpen={openTooltip === 'Max Drawdown'} onOpen={() => setOpenTooltip('Max Drawdown')} onClose={() => setOpenTooltip(null)} tooltipClassName="info-tooltip-right" />
            </th>
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
                    {formatPercent(s.total_return)}
                  </td>
                  <td className={s.annualized_return >= 0 ? 'positive' : 'negative'}>
                    {formatPercent(s.annualized_return)}
                  </td>
                  <td>{formatPercent(s.volatility)}</td>
                  <td className={s.sharpe_ratio >= 1 ? 'good' : ''}>
                    {s.sharpe_ratio.toFixed(2)}
                  </td>
                  <td className="negative">{formatPercent(s.max_drawdown)}</td>
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
