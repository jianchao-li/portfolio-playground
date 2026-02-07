'use client';

import { PortfolioStats } from '@/lib/api';
import { getPortfolioColor } from '@/lib/colors';

interface StatsTableProps {
  stats: PortfolioStats[];
  highlightedPortfolio?: string | null;
  onPortfolioHover?: (name: string | null) => void;
}

export default function StatsTable({ stats, highlightedPortfolio, onPortfolioHover }: StatsTableProps) {
  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

  return (
    <div className="stats-table-container">
      <h3>Portfolio Statistics</h3>
      <table className="stats-table">
        <thead>
          <tr>
            <th>Portfolio</th>
            <th>Total Return</th>
            <th>Annualized Return</th>
            <th>Volatility</th>
            <th>Sharpe Ratio</th>
            <th>Max Drawdown</th>
          </tr>
        </thead>
        <tbody>
          {stats.length > 0 ? (
            stats.map((s, index) => {
              const color = getPortfolioColor(index);
              const isHighlighted = highlightedPortfolio === s.name;
              const isDimmed = highlightedPortfolio && !isHighlighted;

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
