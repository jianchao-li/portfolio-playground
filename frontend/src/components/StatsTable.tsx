'use client';

import { useState } from 'react';
import { PortfolioStats } from '@/lib/api';
import { getPortfolioColor } from '@/lib/colors';
import { formatPercent } from '@/lib/formatting';
import { getHighlightState } from '@/lib/utils';

const METRIC_DEFINITIONS: Record<string, string> = {
  'Total Return': 'The overall gain or loss of an investment over the selected period, including capital appreciation and dividends, expressed as a percentage.',
  'Annualized Return': 'The geometric average yearly return. It shows what annual return would produce the same total return if compounded each year.',
  'Volatility': 'A measure of risk based on the standard deviation of returns. Higher volatility means larger price swings and greater uncertainty.',
  'Sharpe Ratio': 'Mean daily excess return ÷ volatility of daily excess returns, scaled to a yearly basis. Excess return uses the current 3-month U.S. Treasury bill rate. Higher is better.',
  'Max Drawdown': 'The largest peak-to-trough decline during the period. It shows the worst-case loss an investor could have experienced.',
};

interface InfoTooltipProps {
  term: string;
  isOpen: boolean;
  onToggle: () => void;
}

function InfoTooltip({ term, isOpen, onToggle }: InfoTooltipProps) {
  return (
    <span className="info-tooltip-wrapper">
      <button
        type="button"
        className="info-icon"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={`Info about ${term}`}
      >
        ⓘ
      </button>
      {isOpen && (
        <div className="info-tooltip">
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
  highlightedPortfolio?: string | null;
  onPortfolioHover?: (name: string | null) => void;
}

export default function StatsTable({ stats, highlightedPortfolio, onPortfolioHover }: StatsTableProps) {
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  const toggleTooltip = (term: string) => {
    setOpenTooltip(openTooltip === term ? null : term);
  };

  return (
    <div className="stats-table-container" onClick={() => setOpenTooltip(null)}>
      <h3>Portfolio Statistics</h3>
      <table className="stats-table">
        <thead>
          <tr>
            <th>Portfolio</th>
            <th>
              Total Return
              <InfoTooltip term="Total Return" isOpen={openTooltip === 'Total Return'} onToggle={() => toggleTooltip('Total Return')} />
            </th>
            <th>
              Annualized Return
              <InfoTooltip term="Annualized Return" isOpen={openTooltip === 'Annualized Return'} onToggle={() => toggleTooltip('Annualized Return')} />
            </th>
            <th>
              Volatility
              <InfoTooltip term="Volatility" isOpen={openTooltip === 'Volatility'} onToggle={() => toggleTooltip('Volatility')} />
            </th>
            <th>
              Sharpe Ratio
              <InfoTooltip term="Sharpe Ratio" isOpen={openTooltip === 'Sharpe Ratio'} onToggle={() => toggleTooltip('Sharpe Ratio')} />
            </th>
            <th>
              Max Drawdown
              <InfoTooltip term="Max Drawdown" isOpen={openTooltip === 'Max Drawdown'} onToggle={() => toggleTooltip('Max Drawdown')} />
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.length > 0 ? (
            stats.map((s, index) => {
              const color = getPortfolioColor(index);
              const { isHighlighted, isDimmed } = getHighlightState(s.name, highlightedPortfolio ?? null);

              return (
                <tr
                  key={s.name}
                  className={`stats-row ${isHighlighted ? 'highlighted' : ''} ${isDimmed ? 'dimmed' : ''}`}
                  style={{
                    borderLeft: `4px solid ${color}`,
                    backgroundColor: isHighlighted ? `${color}15` : `${color}08`,
                  }}
                  onMouseEnter={() => onPortfolioHover?.(s.name)}
                  onMouseLeave={() => onPortfolioHover?.(null)}
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
