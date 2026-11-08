/**
 * CSV export of the current view, built in the browser from data already in
 * memory. Loaded on demand (dynamic import from CsvButton).
 *
 * No runtime imports, so it can be unit-tested with plain Node
 * (scripts/csv.test.mjs).
 */

export type Cell = string | number | null | undefined;

const REBALANCE_PERIOD = { monthly: 'month', quarterly: 'quarter', annually: 'year' } as const;

/** Methodology text for a rebalancing schedule. */
export const rebalanceText = (rebalance: 'none' | keyof typeof REBALANCE_PERIOD) =>
  rebalance === 'none'
    ? 'None (buy-and-hold; weights drift with prices)'
    : `${rebalance[0].toUpperCase()}${rebalance.slice(1)}: back to target weights at the close of the first trading day of each ${REBALANCE_PERIOD[rebalance]}; no transaction costs or taxes`;

// Cells starting with these can be run as formulas by spreadsheet apps
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field (RFC 4180). Numbers are written as-is. Text that could be
 * read as a formula (= + - @, tab, CR) is prefixed with an apostrophe, then
 * quoted when it contains a comma, quote, line break or edge spaces.
 */
export function csvCell(value: Cell): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text: CRLF line endings, with a BOM so Excel reads UTF-8. */
export function toCsv(rows: Cell[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export interface ExportPortfolio {
  name: string;
  assets: { symbol: string; weight: number }[];
  stats: {
    total_return: number;
    annualized_return: number | null;
    volatility: number | null;
    sharpe_ratio: number | null;
    sortino_ratio: number | null;
    max_drawdown: number;
  };
  performance: { dates: string[]; values: number[] };
  dataStart?: string;
  dataEnd?: string;
}

export interface ExportInput {
  portfolios: ExportPortfolio[];
  /** Currency the values and stats are in. */
  currency: string;
  /** Selected range (YYYY-MM-DD). */
  startDate: string;
  endDate: string;
  alignedStart?: string | null;
  /** Rebalancing schedule ('none' = buy-and-hold). */
  rebalance?: 'none' | 'monthly' | 'quarterly' | 'annually';
  /** Methodology notes, one per row. */
  notes: string[];
  /** Page URL that reproduces this view. */
  url?: string;
}

/**
 * The export: a short header (window, currency, methodology), the statistics
 * table (returns and ratios as decimals), then daily values for every
 * portfolio on the union of their dates (blank before a portfolio starts).
 */
export function buildExportCsv(input: ExportInput): string {
  const { portfolios, currency } = input;
  const rows: Cell[][] = [
    ['Portfolio Playground export'],
    ['Selected range', input.startDate, input.endDate],
    ['Currency', currency],
  ];
  if (input.alignedStart) rows.push(['Aligned start date', input.alignedStart]);
  rows.push(['Rebalancing', rebalanceText(input.rebalance ?? 'none')]);
  if (input.url) rows.push(['Link', input.url]);
  for (const note of input.notes) rows.push(['Note', note]);
  rows.push([]);

  rows.push(['Statistics (decimals: 0.1 = 10%)']);
  rows.push(['Portfolio', 'Holdings', 'Data start', 'Data end', 'Total return', 'Annualized return',
    'Volatility', 'Sharpe ratio', 'Sortino ratio', 'Max drawdown']);
  for (const p of portfolios) {
    rows.push([
      p.name,
      p.assets.map((a) => `${a.symbol} ${Math.round(a.weight * 10000) / 100}%`).join('; '),
      p.performance.dates[0] ?? p.dataStart,
      p.performance.dates[p.performance.dates.length - 1] ?? p.dataEnd,
      p.stats.total_return,
      p.stats.annualized_return,
      p.stats.volatility,
      p.stats.sharpe_ratio,
      p.stats.sortino_ratio,
      p.stats.max_drawdown,
    ]);
  }
  rows.push([]);

  rows.push([`Daily value (${currency}; each portfolio starts at 100 USD converted at the start date's rate)`]);
  rows.push(['Date', ...portfolios.map((p) => p.name)]);
  const byDate = portfolios.map((p) => new Map(p.performance.dates.map((d, i) => [d, p.performance.values[i]])));
  const dates = Array.from(new Set(portfolios.flatMap((p) => p.performance.dates))).sort();
  for (const date of dates) rows.push([date, ...byDate.map((m) => m.get(date) ?? null)]);

  return toCsv(rows);
}

/** File name such as portfolio-playground_2023-01-01_2025-12-31_USD.csv */
export const exportFileName = (input: Pick<ExportInput, 'startDate' | 'endDate' | 'currency'>) =>
  `portfolio-playground_${input.startDate}_${input.endDate}_${input.currency}.csv`.replace(/[^\w.-]/g, '_');
