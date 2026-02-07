'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PerformanceData } from '@/lib/api';
import { getPortfolioColor } from '@/lib/colors';
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE } from '@/lib/theme';
import { getHighlightState } from '@/lib/utils';

interface PerformanceChartProps {
  data: { name: string; performance: PerformanceData }[];
  highlightedPortfolio?: string | null;
  onPortfolioHover?: (name: string | null) => void;
}

export default function PerformanceChart({ data, highlightedPortfolio, onPortfolioHover }: PerformanceChartProps) {
  if (!data.length || !data[0]?.performance?.dates?.length) {
    return (
      <div className="chart-container">
        <h3>Portfolio Performance (Normalized to 100)</h3>
        <div className="chart-empty">
          <p>Select portfolios to compare performance</p>
        </div>
      </div>
    );
  }

  // Memoize chart data transformation
  const chartData = useMemo(() => {
    return data[0].performance.dates.map((date, i) => {
      const point: Record<string, string | number> = { date };
      data.forEach((portfolio) => {
        point[portfolio.name] = portfolio.performance.values[i];
      });
      return point;
    });
  }, [data]);

  return (
    <div className="chart-container">
      <h3>Portfolio Performance (Normalized to 100)</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={chartData}
          onMouseLeave={() => onPortfolioHover?.(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#d1e3dd" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => value.slice(5)} // Show MM-DD
            interval="preserveStartEnd"
            {...CHART_AXIS_STYLE}
          />
          <YAxis
            domain={['auto', 'auto']}
            {...CHART_AXIS_STYLE}
          />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend
            onMouseEnter={(e) => onPortfolioHover?.(e.dataKey as string)}
            onMouseLeave={() => onPortfolioHover?.(null)}
          />
          {data.map((portfolio, i) => {
            const { isHighlighted, isDimmed } = getHighlightState(portfolio.name, highlightedPortfolio ?? null);
            return (
              <Line
                key={portfolio.name}
                type="monotone"
                dataKey={portfolio.name}
                stroke={getPortfolioColor(i)}
                dot={false}
                strokeWidth={isHighlighted ? 3 : 2}
                strokeOpacity={isDimmed ? 0.25 : 1}
                style={{ transition: 'stroke-width 200ms, stroke-opacity 200ms' }}
                onMouseEnter={() => onPortfolioHover?.(portfolio.name)}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
