'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { PerformanceData, CurrencyInfo, Rebalance } from '@/lib/api';
import { getPortfolioColor } from '@/lib/colors';
import { drawdownSeries } from '@/lib/drawdown';
import { CHART_AXIS_STYLE } from '@/lib/theme';
import InfoTip from './InfoTip';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/**
 * Size the server render is laid out at. The plot area itself always has a
 * fixed CSS height (--chart-height), so swapping to the measured size after
 * hydration changes what's drawn inside the box but never the box itself.
 */
const SSR_DIMENSION = { width: 640, height: 400 };
const CHART_MARGIN = { top: 8, right: 24, bottom: 0, left: 0 };
/** Maximum points per series in the server-rendered first paint. */
const SSR_MAX_POINTS = 300;

// ---------------------------------------------------------------------------
// Data shaping
// ---------------------------------------------------------------------------

type ChartRow = { t: number } & Record<string, number>;

/** 'YYYY-MM-DD' -> UTC midnight epoch ms (timezone independent). */
function toTime(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** One row per date in the union of all series' dates, sorted by time. */
function buildRows(data: PerformanceChartProps['data']): ChartRow[] {
  const byTime = new Map<number, ChartRow>();
  data.forEach(({ name, performance }) => {
    performance.dates.forEach((date, i) => {
      const t = toTime(date);
      let row = byTime.get(t);
      if (!row) {
        row = { t } as ChartRow;
        byTime.set(t, row);
      }
      row[name] = performance.values[i];
    });
  });
  return Array.from(byTime.values()).sort((a, b) => a.t - b.t);
}

/** Row indices kept when each series keeps its min and max in each of `buckets` buckets. */
function minMaxSelection(rows: ChartRow[], names: string[], buckets: number): number[] {
  const keep = new Set<number>([0, rows.length - 1]);
  // Each series' own first and last point (late-starting series begin mid-range)
  for (const name of names) {
    const first = rows.findIndex((r) => r[name] !== undefined);
    if (first === -1) continue;
    keep.add(first);
    for (let i = rows.length - 1; i >= first; i--) {
      if (rows[i][name] !== undefined) { keep.add(i); break; }
    }
  }
  const size = rows.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(rows.length, Math.floor((b + 1) * size));
    for (const name of names) {
      let minI = -1;
      let maxI = -1;
      for (let i = start; i < end; i++) {
        const v = rows[i][name];
        if (v === undefined) continue;
        if (minI === -1 || v < rows[minI][name]) minI = i;
        if (maxI === -1 || v > rows[maxI][name]) maxI = i;
      }
      if (minI !== -1) keep.add(minI);
      if (maxI !== -1) keep.add(maxI);
    }
  }
  return Array.from(keep).sort((a, b) => a - b);
}

/**
 * Downsample for the server-rendered first paint only.
 *
 * Per-bucket min/max, applied per series, keeps each series' true global min
 * and max; each series' own first and last point and the first and last rows
 * overall are always kept too. The bucket count is the largest that keeps the
 * result within `maxPoints` rows.
 */
export function downsampleMinMax(rows: ChartRow[], names: string[], maxPoints = SSR_MAX_POINTS): ChartRow[] {
  if (rows.length <= maxPoints) return rows;
  let lo = 1;
  let hi = Math.floor(maxPoints / 2);
  let best = minMaxSelection(rows, names, lo);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const selection = minMaxSelection(rows, names, mid);
    if (selection.length <= maxPoints) {
      best = selection;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best.map((i) => rows[i]);
}

// ---------------------------------------------------------------------------
// Axis ticks and formatting
// ---------------------------------------------------------------------------

interface TimeTicks {
  ticks: number[];
  format: (t: number) => string;
}

const monthYear = (t: number) => {
  const d = new Date(t);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const monthDay = (t: number) => {
  const d = new Date(t);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** First day of each `stepMonths`-aligned month within [min, max]. */
function monthStarts(min: number, max: number, stepMonths: number): number[] {
  const start = new Date(min);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + (start.getUTCDate() > 1 ? 1 : 0);
  while (m % stepMonths !== 0) m++;
  const out: number[] = [];
  for (;;) {
    const t = Date.UTC(y + Math.floor(m / 12), m % 12, 1);
    if (t > max) break;
    out.push(t);
    m += stepMonths;
  }
  return out;
}

/** Approximate rendered width of an axis label of `chars` characters (12px font), plus a gap. */
const LABEL_PX_PER_CHAR = 6.8;
const LABEL_GAP_PX = 18;
const MAX_X_TICKS = 7;

/** Most ticks whose labels fit side by side in `widthPx` (2..MAX_X_TICKS). */
export function maxTicksFor(widthPx: number | undefined, labelChars: number): number {
  if (widthPx === undefined) return MAX_X_TICKS;
  const fit = Math.floor(widthPx / (labelChars * LABEL_PX_PER_CHAR + LABEL_GAP_PX));
  return Math.max(2, Math.min(MAX_X_TICKS, fit));
}

/** Keep every k-th tick so there are at most `maxTicks`. */
function thin(ticks: number[], maxTicks: number): number[] {
  const k = Math.ceil(ticks.length / maxTicks);
  return k <= 1 ? ticks : ticks.filter((_, i) => i % k === 0);
}

/**
 * Calendar-aligned ticks: Jan 1 of each year for ranges over two years,
 * quarter starts for shorter ranges, month starts below ~9 months, and actual
 * trading days for ranges of a few weeks. Labels are unique by construction.
 *
 * `plotWidthPx` (the measured width of the x axis) limits how many labels are
 * shown so they never overlap: e.g. at 390px a 2-year range shows every other
 * quarter instead of all eight.
 */
export function timeTicks(times: number[], plotWidthPx?: number): TimeTicks {
  if (times.length === 0) return { ticks: [], format: monthYear };
  const min = times[0];
  const max = times[times.length - 1];
  const spanDays = (max - min) / DAY_MS;
  const fit = (labelChars: number) => maxTicksFor(plotWidthPx, labelChars);

  // Coarsen in calendar-aligned steps (every 2nd year, half-years...) until the labels fit
  // (month steps divide 12, so they stay aligned to the calendar: Jan/Jul, Jan/Apr/Jul/Oct...)
  const pick = (stepsMonths: number[], labelChars: number) => {
    const limit = fit(labelChars);
    for (const step of stepsMonths) {
      const ticks = monthStarts(min, max, step);
      if (ticks.length <= limit) return ticks;
    }
    return thin(monthStarts(min, max, stepsMonths[stepsMonths.length - 1]), limit);
  };

  if (spanDays > 730) {
    // Every year, else every 2nd / 5th / 10th calendar year (2020, 2025, ...)
    const all = monthStarts(min, max, 12);
    const max4 = fit(4);
    const years = [1, 2, 5, 10]
      .map((k) => all.filter((t) => new Date(t).getUTCFullYear() % k === 0))
      .find((ticks) => ticks.length <= max4) ?? thin(all, max4);
    return { ticks: years, format: (t) => String(new Date(t).getUTCFullYear()) };
  }
  if (spanDays > 270) {
    const quarters = pick([3, 6, 12], 8);
    if (quarters.length >= 2) return { ticks: quarters, format: monthYear };
  }
  if (spanDays > 45) {
    const months = pick([1, 2, 3, 6], 8);
    if (months.length >= 2) return { ticks: months, format: monthYear };
  }
  // Very short ranges: label actual trading days (unique dates, so unique labels)
  return { ticks: thin(times, fit(6)), format: monthDay };
}

function currencyFormatter(currency: string, fractionDigits: number, compact: boolean) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      minimumFractionDigits: compact ? 0 : fractionDigits,
      maximumFractionDigits: compact ? 1 : fractionDigits,
    });
  } catch {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: fractionDigits });
  }
}

const formatPercentChange = (ratio: number) =>
  `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------

interface ChartInfoTooltipProps {
  currency: string;
  currencyName: string;
  rebalance: Rebalance;
}

const REBALANCE_TEXT: Record<Exclude<Rebalance, 'none'>, string> = {
  monthly: 'on the first trading day of each month',
  quarterly: 'on the first trading day of each quarter',
  annually: 'on the first trading day of each year',
};

function ChartInfoTooltip({ currency, currencyName, rebalance }: ChartInfoTooltipProps) {
  const isUSD = currency === 'USD';
  return (
    <InfoTip
      label="How this chart works"
      trigger={<span aria-hidden="true">&#9432;</span>}
      triggerClassName="info-icon"
      wrapperClassName="info-tooltip-wrapper"
      tooltipClassName="info-tooltip chart-info-tooltip"
    >
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
            <p>The dashed line marks the starting value.</p>
            {rebalance === 'none' ? (
              <p>Results assume buy-and-hold with no rebalancing. Weights drift with market movements over time.</p>
            ) : (
              <p>
                Portfolios are rebalanced back to their target weights {REBALANCE_TEXT[rebalance]} (no
                transaction costs or taxes); between rebalances, weights drift with the market.
              </p>
            )}
          </div>
    </InfoTip>
  );
}

interface PointTooltipProps extends TooltipProps<number, string> {
  colors: Record<string, string>;
  startValues: Record<string, number>;
  formatValue: (v: number) => string;
}

function PointTooltip({ active, payload, label, colors, startValues, formatValue }: PointTooltipProps) {
  if (!active || !payload?.length || typeof label !== 'number') return null;
  const items = payload
    .filter((p) => typeof p.value === 'number' && p.name != null)
    .map((p) => ({ name: String(p.name), value: p.value as number }))
    .sort((a, b) => b.value - a.value);
  const d = new Date(label);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">
        {`${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`}
      </div>
      <table>
        <tbody>
          {items.map(({ name, value }) => {
            const start = startValues[name];
            return (
              <tr key={name}>
                <td>
                  <span className="chart-tooltip-swatch" style={{ background: colors[name] }} aria-hidden="true" />
                  {name}
                </td>
                <td className="chart-tooltip-value">{formatValue(value)}</td>
                <td className="chart-tooltip-change">{start ? formatPercentChange(value / start - 1) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface DrawdownTooltipProps extends TooltipProps<number, string> {
  colors: Record<string, string>;
}

/** Drawdown at the hovered date, shallowest first (same order as Growth: best first). */
function DrawdownTooltip({ active, payload, label, colors }: DrawdownTooltipProps) {
  if (!active || !payload?.length || typeof label !== 'number') return null;
  const items = payload
    .filter((p) => typeof p.value === 'number' && p.name != null)
    .map((p) => ({ name: String(p.name), value: p.value as number }))
    .sort((a, b) => b.value - a.value);
  const d = new Date(label);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">
        {`${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · from peak`}
      </div>
      <table>
        <tbody>
          {items.map(({ name, value }) => (
            <tr key={name}>
              <td>
                <span className="chart-tooltip-swatch" style={{ background: colors[name] }} aria-hidden="true" />
                {name}
              </td>
              <td className="chart-tooltip-value">{formatDrawdown(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const formatDrawdown = (d: number) =>
  d === 0 ? '0.0%' : `−${Math.abs(d * 100).toFixed(1)}%`;

type ChartView = 'growth' | 'drawdown';
const CHART_VIEWS: { view: ChartView; label: string }[] = [
  { view: 'growth', label: 'Growth' },
  { view: 'drawdown', label: 'Drawdown' },
];

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

interface PerformanceChartProps {
  data: { name: string; performance: PerformanceData }[];
  currency?: string;
  currencies?: CurrencyInfo[];
  highlightedIndex?: number | null;
  /** Optional control shown at the right of the card header (e.g. Share). */
  headerAction?: ReactNode;
  /** Rebalancing the shown data was computed with (for the "How this chart works" note). */
  rebalance?: Rebalance;
}

export default function PerformanceChart({
  data, currency = 'USD', currencies = [], highlightedIndex, headerAction, rebalance = 'none',
}: PerformanceChartProps) {
  const currencyName = currencies.find((c) => c.code === currency)?.name || 'US Dollar';

  // The server render (and the first client render, which must match it for
  // hydration) uses a downsampled series at a fixed size. Right after
  // hydration the chart switches to the full series at the measured size.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Growth (the server-rendered default) or Drawdown, computed on demand
  // from the same series: no extra request
  const [view, setView] = useState<ChartView>('growth');

  const names = useMemo(() => data.map((d) => d.name), [data]);
  const rows = useMemo(() => buildRows(data), [data]);
  const drawdown = useMemo(() => {
    if (view !== 'drawdown') return null;
    const series = data.map((d) => ({
      name: d.name,
      performance: { dates: d.performance.dates, values: drawdownSeries(d.performance.values) },
    }));
    const deepest = series.map((s) => ({ name: s.name, value: Math.min(0, ...s.performance.values) }));
    const floor = Math.min(0, ...deepest.map((d) => d.value));
    return {
      rows: buildRows(series),
      deepest,
      // 1 decimal on the axis for shallow drawdowns
      formatTick: (v: number) => (v === 0 ? '0%' : `−${Math.abs(v * 100).toFixed(floor > -0.05 ? 1 : 0)}%`),
    };
  }, [data, view]);
  const ssrRows = useMemo(() => downsampleMinMax(rows, names), [rows, names]);
  const chartRows = hydrated ? rows : ssrRows;

  const colors = useMemo(
    () => Object.fromEntries(names.map((name, i) => [name, getPortfolioColor(i)])),
    [names]
  );

  // Each series' own first value, for "% since start" in the tooltip
  const startValues = useMemo(
    () => Object.fromEntries(data
      .filter((d) => d.performance.values.length > 0)
      .map((d) => [d.name, d.performance.values[0]])),
    [data]
  );

  // Starting value of the range: the first value of the earliest series
  // ($100, or $100 converted at the starting exchange rate)
  const referenceValue = useMemo(() => {
    let earliest: { t: number; v: number } | null = null;
    for (const d of data) {
      if (!d.performance.dates.length) continue;
      const t = toTime(d.performance.dates[0]);
      if (!earliest || t < earliest.t) earliest = { t, v: d.performance.values[0] };
    }
    return earliest?.v ?? null;
  }, [data]);

  // Measured chart width (the server render uses SSR_DIMENSION), so the
  // number of x-axis labels can follow the space available
  const [plotWidth, setPlotWidth] = useState(SSR_DIMENSION.width);

  // Currency formatting scaled to the data: decimals for tight ranges,
  // compact notation for currencies with large nominal values (KRW, IDR...)
  const { formatYTick, formatValue, yAxisWidth } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const d of data) {
      for (const v of d.performance.values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (referenceValue != null) {
      min = Math.min(min, referenceValue);
      max = Math.max(max, referenceValue);
    }
    const span = max - min;
    const compact = max >= 100_000;
    const tickDigits = span < 5 ? 2 : span < 50 ? 1 : 0;
    const tickFmt = currencyFormatter(currency, tickDigits, compact);
    const valueFmt = currencyFormatter(currency, max >= 10_000 ? 0 : 2, false);
    const longest = Math.max(tickFmt.format(min).length, tickFmt.format(max).length);
    return {
      formatYTick: (v: number) => tickFmt.format(v),
      formatValue: (v: number) => valueFmt.format(v),
      yAxisWidth: Math.max(48, longest * 7.5 + 10),
    };
  }, [data, currency, referenceValue]);

  // Room for x-axis labels: chart width minus the y axis and right margin
  const xAxisWidth = Math.max(0, plotWidth - yAxisWidth - CHART_MARGIN.right);
  const { ticks, format: formatTick } = useMemo(
    () => timeTicks(rows.map((r) => r.t), xAxisWidth),
    [rows, xAxisWidth]
  );
  const onResize = (width: number) => setPlotWidth(width);

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h3>
          Portfolio Performance
          <ChartInfoTooltip
            currency={currency}
            currencyName={currencyName}
            rebalance={rebalance}
          />
        </h3>
        <div className="chart-header-controls">
          {rows.length > 0 && (
            <div className="range-presets chart-view-toggle" role="group" aria-label="Chart view">
              {CHART_VIEWS.map(({ view: v, label }) => (
                <button
                  key={v}
                  type="button"
                  className={view === v ? 'range-preset active' : 'range-preset'}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {headerAction}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="chart-empty">
          <p>Select portfolios to compare performance</p>
        </div>
      ) : drawdown ? (
        <div className="chart-plot">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: plotWidth, height: SSR_DIMENSION.height }} onResize={onResize}>
            <AreaChart id="drawdown-chart" data={drawdown.rows} margin={CHART_MARGIN}>
              <CartesianGrid vertical={false} stroke="#eceef1" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                ticks={ticks}
                tickFormatter={formatTick}
                interval={0}
                {...CHART_AXIS_STYLE}
              />
              <YAxis
                domain={['auto', 0]}
                tickFormatter={drawdown.formatTick}
                width={yAxisWidth}
                interval={0}
                {...CHART_AXIS_STYLE}
              />
              <ReferenceLine y={0} stroke="#9aa0a6" strokeDasharray="4 4" />
              <Tooltip
                content={<DrawdownTooltip colors={colors} />}
                cursor={{ stroke: '#c9ced6' }}
                isAnimationActive={false}
              />
              {names.map((name, i) => (
                <Area
                  key={name}
                  type="linear"
                  dataKey={name}
                  baseValue={0}
                  stroke={getPortfolioColor(i)}
                  fill={getPortfolioColor(i)}
                  fillOpacity={highlightedIndex != null ? (i === highlightedIndex ? 0.18 : 0.02) : 0.08}
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                  strokeWidth={highlightedIndex != null ? (i === highlightedIndex ? 2.5 : 1.5) : 1.5}
                  strokeOpacity={highlightedIndex != null ? (i === highlightedIndex ? 1 : 0.2) : 1}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          {/* Screen-reader summary of the view (the chart itself is visual only) */}
          <p
            className="sr-only"
            data-testid="drawdown-summary"
            data-deepest={JSON.stringify(Object.fromEntries(drawdown.deepest.map((d) => [d.name, d.value])))}
          >
            {'Deepest drawdown: '}
            {drawdown.deepest.map((d) => `${d.name} ${formatDrawdown(d.value)}`).join('; ')}
          </p>
        </div>
      ) : (
        <div className={hydrated ? 'chart-plot' : 'chart-plot chart-plot--static'}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={SSR_DIMENSION} onResize={onResize}>
            {/* Fixed id: recharts' default clip-path id comes from a global counter,
                which differs between the server and client renders */}
            <LineChart id="performance-chart" data={chartRows} margin={CHART_MARGIN}>
              <CartesianGrid vertical={false} stroke="#eceef1" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                ticks={ticks}
                tickFormatter={formatTick}
                interval={0}
                {...CHART_AXIS_STYLE}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={formatYTick}
                width={yAxisWidth}
                // interval={0}: no text measurement, which the server can't do
                interval={0}
                {...CHART_AXIS_STYLE}
              />
              {referenceValue != null && (
                <ReferenceLine
                  y={referenceValue}
                  stroke="#9aa0a6"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                />
              )}
              <Tooltip
                content={<PointTooltip colors={colors} startValues={startValues} formatValue={formatValue} />}
                cursor={{ stroke: '#c9ced6' }}
                isAnimationActive={false}
              />
              {names.map((name, i) => (
                <Line
                  key={name}
                  type="linear"
                  dataKey={name}
                  stroke={getPortfolioColor(i)}
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                  strokeWidth={highlightedIndex != null ? (i === highlightedIndex ? 2.5 : 1.5) : 1.75}
                  strokeOpacity={highlightedIndex != null ? (i === highlightedIndex ? 1 : 0.2) : 1}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {rows.length > 0 && (
        // Plain HTML legend: identical in the server render and after hydration
        <ul className="chart-legend">
          {names.map((name) => (
            <li key={name}>
              <span className="chart-legend-swatch" style={{ background: colors[name] }} aria-hidden="true" />
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
