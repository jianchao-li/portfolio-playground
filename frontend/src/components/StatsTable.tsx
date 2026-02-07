'use client';

import { PortfolioStats } from '@/lib/api';

interface StatsTableProps {
  stats: PortfolioStats[];
}

export default function StatsTable({ stats }: StatsTableProps) {
  if (!stats.length) return null;

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
          {stats.map((s) => (
            <tr key={s.name}>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
