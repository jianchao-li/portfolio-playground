// Offline stand-in for the FastAPI backend, used by the browser smoke tests
// (scripts/smoke.mjs). Serves deterministic synthetic data for the endpoints
// the frontend calls, with the same response shapes and error messages.
//
// Usage: node scripts/smoke-mock-backend.mjs [port]   (default 8765)
import http from 'node:http';

// Symbols the mock knows about (search results + price data). Anything else
// behaves like a delisted / unknown ticker.
const SYMBOLS = {
  VOO: 'Vanguard S&P 500 ETF', QQQ: 'Invesco QQQ Trust', VEA: 'Vanguard FTSE Developed Markets ETF',
  VWO: 'Vanguard FTSE Emerging Markets ETF', GLD: 'SPDR Gold Shares', IBIT: 'iShares Bitcoin Trust',
  VIXY: 'ProShares VIX Short-Term Futures ETF', VTI: 'Vanguard Total Stock Market ETF',
  MSFT: 'Microsoft Corporation', AAPL: 'Apple Inc.', BND: 'Vanguard Total Bond Market ETF',
  '7203.T': 'Toyota Motor Corporation',
};
// Trading currency (Yahoo metadata); everything else is USD
const TRADING_CURRENCY = { '7203.T': 'JPY' };
// Symbols that started trading later (for start-date alignment)
const LISTED = { IBIT: '2024-01-11' };
const CURRENCIES = new Set(['USD', 'EUR', 'JPY', 'GBP']);
const FX = { USD: 1, EUR: 0.92, JPY: 150, GBP: 0.79 };

const DAY = 86_400_000;
const toISO = (t) => new Date(t).toISOString().slice(0, 10);
const parseISO = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? '') ? Date.parse(`${s}T00:00:00Z`) : NaN);

/** Weekdays in [start, end], as ISO dates. */
function tradingDays(start, end) {
  const days = [];
  for (let t = start; t <= end; t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(toISO(t));
  }
  return days;
}

/** Deterministic daily return for a symbol on a date (roughly +-1%). */
function dailyReturn(symbol, iso) {
  let h = 2166136261;
  for (const ch of `${symbol}|${iso}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) / 2 ** 32 - 0.48) * 0.02;
}

function stats(name, values, days) {
  const downside = (rets) => Math.sqrt(rets.reduce((a, r) => a + Math.min(r, 0) ** 2, 0) / rets.length);
  const rets = values.slice(1).map((v, i) => v / values[i] - 1);
  const total = values[values.length - 1] / values[0] - 1;
  const years = (Date.parse(days[days.length - 1]) - Date.parse(days[0])) / DAY / 365.25;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = rets.length > 1
    ? Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1)) : NaN;
  let peak = values[0];
  let maxDd = 0;
  for (const v of values) { peak = Math.max(peak, v); maxDd = Math.min(maxDd, v / peak - 1); }
  const round = (x) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);
  return {
    name,
    total_return: round(total),
    annualized_return: years >= 1 ? round((1 + total) ** (1 / years) - 1) : null,
    volatility: round(sd * Math.sqrt(252)),
    sharpe_ratio: round((mean / sd) * Math.sqrt(252)),
    sortino_ratio: rets.length > 1 && downside(rets) > 0 ? round((mean / downside(rets)) * Math.sqrt(252)) : null,
    max_drawdown: round(maxDd),
  };
}

class HttpError extends Error {
  constructor(status, detail) { super(String(detail)); this.status = status; this.detail = detail; }
}

function validateRange(body) {
  const start = parseISO(body.start_date);
  const end = parseISO(body.end_date);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new HttpError(422, [{ type: 'date_parsing', msg: 'Input should be a valid date', loc: ['body'] }]);
  }
  if (start >= end) {
    throw new HttpError(422, [{ type: 'value_error', msg: 'Value error, Start date must be before end date', loc: ['body'] }]);
  }
  if (body.currency !== undefined && !CURRENCIES.has(body.currency)) {
    throw new HttpError(422, [{ type: 'value_error', msg: `Value error, Unsupported currency: ${body.currency}`, loc: ['body'] }]);
  }
  return { start, end, currency: body.currency ?? 'USD' };
}

const PERIOD = {
  monthly: (iso) => iso.slice(0, 7),
  quarterly: (iso) => `${iso.slice(0, 4)}Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3)}`,
  annually: (iso) => iso.slice(0, 4),
};

/** First trading day with data for every asset in the portfolio. */
function portfolioStart(portfolio, start) {
  return Math.max(start, ...portfolio.assets.map((a) => (LISTED[a.symbol] ? Date.parse(`${LISTED[a.symbol]}T00:00:00Z`) : 0)));
}

function analyze(portfolio, requestedStart, end, currency, rebalance = 'none', clipStart = requestedStart) {
  const total = portfolio.assets.reduce((a, x) => a + x.weight, 0);
  if (Math.abs(total - 1) > 1e-9) throw new HttpError(400, `Portfolio '${portfolio.name}' weights must sum to 1.0`);
  const bad = portfolio.assets.map((a) => a.symbol).filter((s) => !(s in SYMBOLS));
  if (bad.length) throw new HttpError(400, `No price data found for: ${bad.join(', ')}`);
  const dataStart = tradingDays(portfolioStart(portfolio, requestedStart), end)[0];
  const days = tradingDays(portfolioStart(portfolio, clipStart), end);
  if (days.length < 2) {
    throw new HttpError(400, `Not enough trading days in the selected range (found ${days.length}, need at least 2). Please choose a longer date range.`);
  }
  // Holdings in dollars; optionally reset to target weights on the first
  // trading day of each period
  let holdings = Object.fromEntries(portfolio.assets.map((a) => [a.symbol, a.weight * 100]));
  const period = PERIOD[rebalance];
  const values = days.map((iso, i) => {
    if (i > 0) {
      for (const a of portfolio.assets) holdings[a.symbol] *= 1 + dailyReturn(a.symbol, iso);
      if (period && period(iso) !== period(days[i - 1])) {
        const total = Object.values(holdings).reduce((x, y) => x + y, 0);
        holdings = Object.fromEntries(portfolio.assets.map((a) => [a.symbol, a.weight * total]));
      }
    }
    const v = Object.values(holdings).reduce((x, y) => x + y, 0) * FX[currency];
    return Math.round(v * 100) / 100;
  });
  return {
    stats: stats(portfolio.name, values, days),
    performance: { dates: days, values },
    currency,
    assets: portfolio.assets.map((a) => ({ ...a, currency: TRADING_CURRENCY[a.symbol] ?? 'USD' })),
    data_start: dataStart,
    data_end: days[days.length - 1],
  };
}

/** Request log, for tests that assert which calls the page made. */
export const requestLog = [];

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(204, {});
  let body = {};
  if (req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { body = JSON.parse(raw || '{}'); } catch { return send(422, { detail: [{ msg: 'Invalid JSON' }] }); }
  }
  requestLog.push({ method: req.method, path: url.pathname, query: url.search, body });

  try {
    switch (`${req.method} ${url.pathname}`) {
      case 'GET /health':
      case 'GET /':
        return send(200, { status: 'ok' });
      case 'GET /api/portfolio/currencies':
        return send(200, [...CURRENCIES].map((code) => ({ code, name: code, flag: '' })));
      case 'GET /api/portfolio/symbols/search': {
        const q = (url.searchParams.get('q') ?? '').trim().toUpperCase();
        return send(200, q ? Object.entries(SYMBOLS)
          .filter(([s]) => s.startsWith(q))
          .map(([symbol, name]) => ({ symbol, name, type: 'ETF', exchange: 'PCX' })) : []);
      }
      case 'POST /api/portfolio/analyze': {
        const { start, end, currency } = validateRange(body);
        return send(200, analyze(body.portfolio, start, end, currency, body.rebalance));
      }
      case 'POST /api/portfolio/prefetch': // background preset prefetch: same as /compare
      case 'POST /api/portfolio/compare': {
        const { start, end, currency } = validateRange(body);
        const run = (clip) => body.portfolios.map((p) => analyze(p, start, end, currency, body.rebalance, clip));
        let portfolios = run(start);
        let alignedStart = null;
        const starts = portfolios.map((p) => p.data_start);
        if (body.align_start && new Set(starts).size > 1) {
          alignedStart = starts.sort().at(-1);
          portfolios = run(Date.parse(`${alignedStart}T00:00:00Z`));
        }
        return send(200, { portfolios, aligned_start: alignedStart });
      }
      default:
        return send(404, { detail: 'Not Found' });
    }
  } catch (err) {
    if (err instanceof HttpError) return send(err.status, { detail: err.detail });
    return send(500, { detail: 'Internal error' });
  }
}

/** Start the mock on `port`; resolves to the http.Server. */
export function startMockBackend(port = 8765) {
  const server = http.createServer((req, res) => { handle(req, res); });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 8765);
  await startMockBackend(port);
  console.log(`Mock backend listening on http://127.0.0.1:${port}`);
}
