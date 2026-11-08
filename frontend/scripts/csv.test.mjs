// Unit tests for src/lib/csv.ts (CSV export).
// Usage: node --no-warnings --test scripts/csv.test.mjs   (Node >= 22.18 / 23.6)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv, buildExportCsv, exportFileName, rebalanceText } from '../src/lib/csv.ts';

/** Minimal RFC 4180 parser, to check the output round-trips. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

test('plain values, numbers and blanks', () => {
  assert.equal(csvCell('VOO'), 'VOO');
  assert.equal(csvCell(0.1234), '0.1234');
  assert.equal(csvCell(-0.25), '-0.25'); // numbers are never neutralized
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(NaN), '');
});

test('quoting: commas, quotes, line breaks, edge spaces', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell(' padded '), '" padded "');
});

test('formula injection guard for = + - @ tab CR', () => {
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-Hedge'), "'-Hedge");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('\tcmd'), "'\tcmd");
  assert.equal(csvCell('\rcmd'), `"'\rcmd"`);
  assert.equal(csvCell('a=b'), 'a=b'); // only a leading character matters
});

test('toCsv: BOM, CRLF rows, round-trips through a parser', () => {
  const text = toCsv([['a', 'b,c'], [1, null], ['x"y']]);
  assert.ok(text.startsWith('\uFEFF'));
  assert.ok(text.endsWith('\r\n'));
  assert.deepEqual(parseCsv(text.slice(1)), [['a', 'b,c'], ['1', ''], ['x"y']]);
});

const sample = {
  portfolios: [
    {
      name: 'S&P 500', assets: [{ symbol: 'VOO', weight: 1 }],
      stats: { total_return: 0.5, annualized_return: 0.2, volatility: 0.15, sharpe_ratio: 1.1, sortino_ratio: 1.6, max_drawdown: -0.1 },
      performance: { dates: ['2024-01-10', '2024-01-11', '2024-01-12'], values: [100, 101.5, 99.25] },
    },
    {
      name: '=evil, "co"', assets: [{ symbol: 'IBIT', weight: 0.6 }, { symbol: 'GLD', weight: 0.4 }],
      stats: { total_return: -0.05, annualized_return: null, volatility: null, sharpe_ratio: null, sortino_ratio: null, max_drawdown: -0.2 },
      performance: { dates: ['2024-01-11', '2024-01-12'], values: [100, 95] },
    },
  ],
  currency: 'JPY', startDate: '2024-01-01', endDate: '2024-01-12', alignedStart: '2024-01-11',
  notes: ['Dividends reinvested.'], url: 'http://localhost:3000/?v=1&p=@VOO',
};

test('export: header, stats and daily values', () => {
  const rows = parseCsv(buildExportCsv(sample).slice(1));
  assert.deepEqual(rows[1], ['Selected range', '2024-01-01', '2024-01-12']);
  assert.deepEqual(rows[2], ['Currency', 'JPY']);
  assert.deepEqual(rows[3], ['Aligned start date', '2024-01-11']);
  assert.deepEqual(rows[4], ['Rebalancing', 'None (buy-and-hold; weights drift with prices)']);
  assert.ok(rows.some((r) => r[0] === 'Note' && r[1] === 'Dividends reinvested.'));

  const header = rows.findIndex((r) => r[0] === 'Portfolio');
  assert.deepEqual(rows[header].slice(4), ['Total return', 'Annualized return', 'Volatility', 'Sharpe ratio', 'Sortino ratio', 'Max drawdown']);
  assert.deepEqual(rows[header + 1], ['S&P 500', 'VOO 100%', '2024-01-10', '2024-01-12', '0.5', '0.2', '0.15', '1.1', '1.6', '-0.1']);
  // Injection-guarded, quoted name; nulls are blank
  assert.deepEqual(rows[header + 2], [`'=evil, "co"`, 'IBIT 60%; GLD 40%', '2024-01-11', '2024-01-12', '-0.05', '', '', '', '', '-0.2']);

  const daily = rows.findIndex((r) => r[0] === 'Date');
  assert.deepEqual(rows[daily], ['Date', 'S&P 500', `'=evil, "co"`]);
  assert.deepEqual(rows.slice(daily + 1), [
    ['2024-01-10', '100', ''],
    ['2024-01-11', '101.5', '100'],
    ['2024-01-12', '99.25', '95'],
  ]);
});

test('file name is safe', () => {
  assert.equal(exportFileName(sample), 'portfolio-playground_2024-01-01_2024-01-12_JPY.csv');
  assert.equal(exportFileName({ startDate: '../x', endDate: 'y z', currency: 'U/SD' }), 'portfolio-playground_.._x_y_z_U_SD.csv');
});

test('rebalancing methodology row', () => {
  const rows = parseCsv(buildExportCsv({ ...sample, rebalance: 'quarterly' }).slice(1));
  const row = rows.find((r) => r[0] === 'Rebalancing');
  assert.equal(row[1], rebalanceText('quarterly'));
  assert.match(row[1], /^Quarterly: back to target weights .* first trading day of each quarter; no transaction costs/);
});
