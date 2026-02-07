'use client';

import { useMemo, useState } from 'react';
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
import { PerformanceData, CurrencyCode, CURRENCY_SYMBOLS } from '@/lib/api';
import { getPortfolioColor } from '@/lib/colors';
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE } from '@/lib/theme';
import { getHighlightState } from '@/lib/utils';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateLabel(dateStr: string): string {
  const [year, month] = dateStr.split('-');
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

function formatFullDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}

interface ChartInfoTooltipProps {
  isOpen: boolean;
  onToggle: () => void;
  currencySymbol: string;
}

function ChartInfoTooltip({ isOpen, onToggle, currencySymbol }: ChartInfoTooltipProps) {
  const isUSD = currencySymbol === '$';
  return (
    <span className="info-tooltip-wrapper">
      <button
        type="button"
        className="info-icon"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label="How this chart works"
      >
        &#9432;
      </button>
      {isOpen && (
        <div className="info-tooltip chart-info-tooltip">
          <div className="info-tooltip-content">
            <strong>How this chart works</strong>
            {isUSD ? (
              <p>
                Each portfolio starts at $100 on the first day.
                The curve shows how that initial investment would have grown (or shrunk) over time.
              </p>
            ) : (
              <p>
                Each portfolio starts with a $100 USD investment, converted to {currencySymbol} at the starting exchange rate.
                The curve shows combined asset performance and currency movement over time.
              </p>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

interface PerformanceChartProps {
  data: { name: string; performance: PerformanceData }[];
  highlightedPortfolio?: string | null;
  onPortfolioHover?: (name: string | null) => void;
  currency?: CurrencyCode;
}

export default function PerformanceChart({ data, highlightedPortfolio, onPortfolioHover, currency = 'USD' }: PerformanceChartProps) {
  const currencySymbol = CURRENCY_SYMBOLS[currency] || '$';
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);

  if (!data.length || !data[0]?.performance?.dates?.length) {
    return (
      <div className="chart-container" onClick={() => setShowInfoTooltip(false)}>
        <h3>
          Portfolio Performance
          <ChartInfoTooltip
            isOpen={showInfoTooltip}
            onToggle={() => setShowInfoTooltip(!showInfoTooltip)}
            currencySymbol={currencySymbol}
          />
        </h3>
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

  // Calculate tick indices for 5-7 evenly spaced labels
  const tickIndices = useMemo(() => {
    const totalPoints = chartData.length;
    const targetTicks = Math.min(6, Math.max(3, Math.floor(totalPoints / 60)));
    const step = Math.floor(totalPoints / targetTicks);
    const indices: number[] = [];

    for (let i = 0; i < totalPoints; i += step) {
      indices.push(i);
    }
    // Always include the last point
    if (indices[indices.length - 1] !== totalPoints - 1) {
      indices.push(totalPoints - 1);
    }
    return indices;
  }, [chartData.length]);

  const ticks = tickIndices.map(i => chartData[i]?.date).filter(Boolean);

  return (
    <div className="chart-container" onClick={() => setShowInfoTooltip(false)}>
      <h3>
        Portfolio Performance
        <ChartInfoTooltip
          isOpen={showInfoTooltip}
          onToggle={() => setShowInfoTooltip(!showInfoTooltip)}
          currencySymbol={currencySymbol}
        />
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={chartData}
          onMouseLeave={() => onPortfolioHover?.(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#d1e3dd" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateLabel}
            ticks={ticks}
            {...CHART_AXIS_STYLE}
          />
          <YAxis
            domain={['auto', 'auto']}
            {...CHART_AXIS_STYLE}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            labelFormatter={formatFullDate}
            formatter={(value: number, name: string) => [`${currencySymbol}${value.toFixed(2)}`, name]}
          />
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
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
