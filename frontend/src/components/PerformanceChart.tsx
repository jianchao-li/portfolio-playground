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
import { PerformanceData, CurrencyCode, CURRENCY_NAMES } from '@/lib/api';
import { getPortfolioColor } from '@/lib/colors';
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE } from '@/lib/theme';

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
  onOpen: () => void;
  onClose: () => void;
  currencyName: string;
}

function ChartInfoTooltip({ isOpen, onOpen, onClose, currencyName }: ChartInfoTooltipProps) {
  const isUSD = currencyName === 'US Dollar';
  return (
    <span
      className="info-tooltip-wrapper"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <span className="info-icon" aria-label="How this chart works">
        &#9432;
      </span>
      {isOpen && (
        <div className="info-tooltip chart-info-tooltip">
          <div className="info-tooltip-content">
            <strong>How this chart works</strong>
            {isUSD ? (
              <p>
                Each portfolio starts at $100 on the first day. Dividends are reinvested.
                The curve shows how that initial investment would have grown (or shrunk) over time.
              </p>
            ) : (
              <p>
                Each portfolio starts with a $100 USD investment, converted to {currencyName} at the starting exchange rate. Dividends are reinvested.
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
  currency?: CurrencyCode;
}

export default function PerformanceChart({ data, currency = 'USD' }: PerformanceChartProps) {
  const currencyName = CURRENCY_NAMES[currency] || 'US Dollar';
  const currencyCode = currency;
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);

  // Memoize chart data transformation - must be called before any early returns
  const chartData = useMemo(() => {
    if (!data.length || !data[0]?.performance?.dates?.length) {
      return [];
    }

    // Build a date→value map for each portfolio for O(1) lookups
    const portfolioMaps = data.map(p => {
      const map = new Map<string, number>();
      p.performance.dates.forEach((date, i) => map.set(date, p.performance.values[i]));
      return map;
    });

    // Collect union of all dates across all portfolios
    const allDatesSet = new Set<string>();
    data.forEach(p => p.performance.dates.forEach(d => allDatesSet.add(d)));
    const allDates = Array.from(allDatesSet).sort();

    return allDates.map(date => {
      const point: Record<string, string | number> = { date };
      data.forEach((p, i) => {
        const value = portfolioMaps[i].get(date);
        if (value !== undefined) {
          point[p.name] = value;
        }
      });
      return point;
    });
  }, [data]);

  // Calculate tick indices for 5-7 evenly spaced labels
  const tickIndices = useMemo(() => {
    const totalPoints = chartData.length;
    if (totalPoints === 0) return [];
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

  if (!data.length || !data[0]?.performance?.dates?.length) {
    return (
      <div className="chart-container">
        <h3>
          Portfolio Performance
          <ChartInfoTooltip
            isOpen={showInfoTooltip}
            onOpen={() => setShowInfoTooltip(true)}
            onClose={() => setShowInfoTooltip(false)}
            currencyName={currencyName}
          />
        </h3>
        <div className="chart-empty">
          <p>Select portfolios to compare performance</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3>
        Portfolio Performance
        <ChartInfoTooltip
          isOpen={showInfoTooltip}
          onOpen={() => setShowInfoTooltip(true)}
          onClose={() => setShowInfoTooltip(false)}
          currencyName={currencyName}
        />
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
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
            formatter={(value: number, name: string) => [
              value != null ? `${value.toFixed(2)} ${currencyCode}` : '—',
              name
            ]}
          />
          <Legend />
          {data.map((portfolio, i) => (
            <Line
              key={portfolio.name}
              type="monotone"
              dataKey={portfolio.name}
              stroke={getPortfolioColor(i)}
              dot={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
