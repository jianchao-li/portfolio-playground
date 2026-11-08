'use client';

import InfoTip from './InfoTip';
import { PortfolioStats } from '@/lib/api';
import { getPortfolioColor } from '@/lib/colors';
import { formatNumber, formatPercent } from '@/lib/formatting';

/** CSS sign class for a return; neutral (empty) when the value is missing. */
const signClass = (value: number | null) =>
  value == null ? '' : value >= 0 ? 'positive' : 'negative';

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });

/** Percent with an explicit sign (+ / −) so gains and losses don't rely on colour alone. */
const formatSignedPercent = (value: number | null) => {
  const text = formatPercent(value);
  if (value == null || text === formatPercent(null)) return text;
  return value > 0 ? `+${text}` : text.replace(/^-/, '\u2212');
};

const METRIC_DEFINITIONS: Record<string, string> = {
  'Total Return': 'The overall gain or loss of an investment over the selected period, including capital appreciation and dividends, expressed as a percentage.',
  'Annualized Return': 'The geometric average yearly return. It shows what annual return would produce the same total return if compounded each year.',
  'Volatility': 'A measure of risk based on the standard deviation of returns. Higher volatility means larger price swings and greater uncertainty.',
  'Sharpe Ratio': 'Risk-adjusted return: (portfolio return − risk-free rate) ÷ volatility. Uses 3-month T-bill rate as risk-free rate. Falls back to 5% annual rate if T-bill data is unavailable. Higher is better.',
  'Sortino Ratio': 'Like the Sharpe ratio, but only downside moves count as risk: (portfolio return − risk-free rate) ÷ downside deviation, which uses only returns below the risk-free rate. Higher is better.',
  'Max Drawdown': 'The largest peak-to-trough decline during the period. It shows the worst-case loss an investor could have experienced.',
};

const ANNUALIZED_NA_TITLE = 'Shown for date ranges of about one year or longer';
const SORTINO_NA_TITLE = 'Not defined: no daily returns fell below the risk-free rate';

/** Yahoo's minor-unit codes, spelled out. */
const CURRENCY_LABELS: Record<string, string> = {
  GBp: 'GBp (pence)', ZAc: 'ZAc (cents)', ILA: 'ILA (agorot)',
};
export const currencyLabel = (code: string) => CURRENCY_LABELS[code] ?? code;

/** "a", "a and b", "a, b and c" */
const listText = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Typographic minus for negative numbers. */
const withMinus = (text: string) => text.replace(/^-/, '\u2212');

interface Column {
  term: string;
  /** Abbreviated header for tight desktop widths. */
  short?: string;
  /** Label shown above the value in the mobile card layout. */
  label: string;
  tooltipClassName?: string;
  cell: (s: PortfolioStats) => { text: string; className?: string; title?: string };
}

// One entry per metric: the desktop table and the mobile cards both render
// from this list, so a new metric is a single addition here.
const COLUMNS: Column[] = [
  {
    term: 'Total Return', short: 'Total Ret.', label: 'Total return',
    cell: (s) => ({ text: formatSignedPercent(s.total_return), className: signClass(s.total_return) }),
  },
  {
    term: 'Annualized Return', short: 'Ann. Return', label: 'Annualized',
    cell: (s) => ({
      text: formatSignedPercent(s.annualized_return),
      className: signClass(s.annualized_return),
      title: s.annualized_return == null ? ANNUALIZED_NA_TITLE : undefined,
    }),
  },
  {
    term: 'Volatility', label: 'Volatility',
    cell: (s) => ({ text: formatPercent(s.volatility) }),
  },
  {
    term: 'Sharpe Ratio', short: 'Sharpe', label: 'Sharpe',
    cell: (s) => ({ text: withMinus(formatNumber(s.sharpe_ratio)) }),
  },
  {
    term: 'Sortino Ratio', short: 'Sortino', label: 'Sortino',
    cell: (s) => ({
      text: withMinus(formatNumber(s.sortino_ratio)),
      title: s.sortino_ratio == null ? SORTINO_NA_TITLE : undefined,
    }),
  },
  {
    term: 'Max Drawdown', short: 'Max DD', label: 'Max drawdown', tooltipClassName: 'info-tooltip-right',
    cell: (s) => ({ text: withMinus(formatPercent(s.max_drawdown)) }),
  },
];

function InfoTooltip({ term, tooltipClassName }: { term: string; tooltipClassName?: string }) {
  return (
    <InfoTip
      label={`About ${term}`}
      trigger={<span aria-hidden="true">ⓘ</span>}
      triggerClassName="info-icon"
      wrapperClassName="info-tooltip-wrapper"
      tooltipClassName={`info-tooltip${tooltipClassName ? ` ${tooltipClassName}` : ''}`}
    >
      <span className="info-tooltip-content">
        <strong>{term}</strong>
        <span className="info-tooltip-text">{METRIC_DEFINITIONS[term]}</span>
      </span>
    </InfoTip>
  );
}

export interface PortfolioWindow {
  name: string;
  /** First/last date with data, before any alignment (YYYY-MM-DD). */
  start: string;
  end: string;
}

interface StatsTableProps {
  stats: PortfolioStats[];
  onHighlight?: (index: number | null) => void;
  /** First/last date actually covered by the data, for the methodology note. */
  dataWindow?: { start: string; end: string; staggered?: boolean } | null;
  /** Currency the stats are computed in. */
  currency?: string;
  /** Date every portfolio was clipped to (align start dates), or null. */
  alignedStart?: string | null;
  /** "Align start dates" control; shown only when portfolios start on different dates. */
  align?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    /** Each portfolio's real data window, for the tooltip. */
    windows: PortfolioWindow[];
  } | null;
  /** Non-USD trading currencies among the holdings (prices not converted). */
  unconvertedCurrencies?: string[];
  /** Rebalancing schedule the stats were computed with. */
  rebalance?: 'none' | 'monthly' | 'quarterly' | 'annually';
}

function AlignControl({ checked, onChange, disabled, windows }: NonNullable<StatsTableProps['align']>) {
  return (
    <span className="align-control">
      <label className="align-label">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        Align start dates
      </label>
      <InfoTip
        label="About aligning start dates"
        trigger={<span aria-hidden="true">ⓘ</span>}
        triggerClassName="info-icon"
        wrapperClassName="info-tooltip-wrapper"
        tooltipClassName="info-tooltip info-tooltip-right"
      >
        <span className="info-tooltip-content">
          <strong>Align start dates</strong>
          <span className="info-tooltip-text">
            Some portfolios have data only from a later date (their newest asset started trading then).
            Aligning starts every portfolio on the latest of these dates, so all stats cover the same period.
          </span>
          <span className="info-tooltip-text align-windows">
            {windows.map((w) => (
              <span key={w.name} className="align-window">
                <span className="align-window-name">{w.name}</span>
                {formatDate(w.start)} – {formatDate(w.end)}
              </span>
            ))}
          </span>
        </span>
      </InfoTip>
    </span>
  );
}

export default function StatsTable({
  stats, onHighlight, dataWindow, currency, alignedStart, align, unconvertedCurrencies = [],
  rebalance = 'none',
}: StatsTableProps) {
  return (
    <div className="stats-table-container">
      <div className="stats-header">
        <h3>Portfolio Statistics</h3>
        {align && <AlignControl {...align} />}
      </div>
      <div className="stats-table-scroll">
      {/* Explicit roles keep the table semantics when narrow screens restyle
          the rows as cards (display: grid drops them in some browsers) */}
      <table className="stats-table" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader">Portfolio</th>
            {COLUMNS.map(({ term, short, tooltipClassName }) => (
              <th key={term} role="columnheader">
                {short ? (
                  <>
                    <span className="header-full">{term}</span><span className="header-short">{short}</span>
                  </>
                ) : term}
                <InfoTooltip term={term} tooltipClassName={tooltipClassName} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {stats.length > 0 ? (
            stats.map((s, index) => {
              const color = getPortfolioColor(index);

              return (
                <tr
                  key={s.name}
                  role="row"
                  className="stats-row"
                  onMouseEnter={() => onHighlight?.(index)}
                  onMouseLeave={() => onHighlight?.(null)}
                >
                  <td role="cell" className="portfolio-name">
                    <span className="chip-swatch" style={{ background: color }} aria-hidden="true" />
                    {s.name}
                  </td>
                  {COLUMNS.map((column) => {
                    const { text, className, title } = column.cell(s);
                    return (
                      <td
                        key={column.term}
                        role="cell"
                        className={className || undefined}
                        title={title}
                        data-label={column.label}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          ) : (
            <tr role="row">
              <td role="cell" colSpan={COLUMNS.length + 1} className="empty-row">
                No portfolios selected
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {stats.length > 0 && (
        <p className="stats-footnote">
          {dataWindow && (
            <>
              {formatDate(dataWindow.start)} – {formatDate(dataWindow.end)}
              {alignedStart
                ? ` (aligned to ${formatDate(alignedStart)}, the latest common start)`
                : dataWindow.staggered && ' (some portfolios start later, when their newest asset began trading)'}
              {' · '}
            </>
          )}
          {currency && <>{currency} · </>}
          Dividends reinvested ·{' '}
          {rebalance === 'none'
            ? 'Buy-and-hold, no rebalancing'
            : `Rebalanced ${rebalance} to target weights (no costs)`}
          {' · '}Annualized over calendar time
          (annualized return needs about a year of data) · Sharpe and Sortino use the average
          13-week US T-bill rate when positive
          {unconvertedCurrencies.length > 0 && (
            <span className="footnote-line">{' '}
              Holdings priced in {listText(unconvertedCurrencies.map(currencyLabel))} use their quoted prices as if in USD; currency conversion for these is not applied yet.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
