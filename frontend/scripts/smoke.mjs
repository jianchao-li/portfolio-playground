// Browser smoke tests against a production build, with an offline mock backend.
//
// Covers the regressions fixed in cycle 1: the analyze-vs-refresh race,
// rename / name collision, editing a selected ticker, short date ranges,
// the empty state, and keyboard / ARIA basics.
//
// Prerequisite: a production build whose API URL points at the mock:
//   NEXT_PUBLIC_API_URL=http://127.0.0.1:8765 pnpm build
// (the mock is not running during the build, so the build also proves it
// survives a dead backend).
//
// Usage:  pnpm test:smoke
// Env:    CHROME_PATH   Chrome/Chromium binary (default: system Chrome)
//         SMOKE_API_PORT  mock backend port (default 8765; must match the build)
//         SMOKE_APP_PORT  port for `next start` (default 3100)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { requestLog, startMockBackend } from './smoke-mock-backend.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = Number(process.env.SMOKE_API_PORT ?? 8765);
const APP_PORT = Number(process.env.SMOKE_APP_PORT ?? 3100);
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const TIME_LIMIT_MS = 60_000;

const DEFAULT_CHROME = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}[process.platform];
const CHROME_PATH = process.env.CHROME_PATH ?? DEFAULT_CHROME;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(resolve(root, '.next/BUILD_ID'))) {
  console.error(`No production build found. Run: NEXT_PUBLIC_API_URL=${API_URL} pnpm build`);
  process.exit(1);
}
if (!CHROME_PATH || !existsSync(CHROME_PATH)) {
  console.error(`Chrome not found at "${CHROME_PATH}". Set CHROME_PATH.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------

/** Fail fast if a port is taken (e.g. a stale server would serve an old build). */
const assertPortFree = (port) => new Promise((ok, fail) => {
  const probe = net.createServer().once('error', () => fail(new Error(`Port ${port} is already in use`)));
  probe.listen(port, '127.0.0.1', () => probe.close(ok));
});
try {
  await assertPortFree(API_PORT);
  await assertPortFree(APP_PORT);
} catch (err) {
  console.error(`${err.message}. Stop whatever is listening there, or set SMOKE_API_PORT / SMOKE_APP_PORT.`);
  process.exit(1);
}

const mock = await startMockBackend(API_PORT);
// Run Next's CLI with this Node directly, in its own process group, so the
// server it forks is stopped together with it.
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
const next = spawn(process.execPath, [nextBin, 'start', '-p', String(APP_PORT), '-H', '127.0.0.1'], {
  cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'production' },
});
const stopNext = () => {
  try { process.kill(-next.pid, 'SIGTERM'); } catch { next.kill(); }
};
let nextOutput = '';
next.stdout.on('data', (d) => { nextOutput += d; });
next.stderr.on('data', (d) => { nextOutput += d; });

let browser;
const cleanup = async () => {
  await browser?.close().catch(() => {});
  stopNext();
  mock.close();
};
const watchdog = setTimeout(async () => {
  console.error(`\nSmoke tests exceeded ${TIME_LIMIT_MS / 1000}s`);
  await cleanup();
  process.exit(1);
}, TIME_LIMIT_MS);

for (let i = 0; ; i++) {
  try {
    if ((await fetch(APP_URL)).ok) break;
  } catch { /* not up yet */ }
  if (i > 100 || next.exitCode !== null) {
    console.error(`next start did not come up:\n${nextOutput}`);
    await cleanup();
    process.exit(1);
  }
  await sleep(100);
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });

const consoleErrors = [];
const pageErrors = [];
const unexpectedResponses = [];
page.on('console', (m) => {
  // Failed requests are tracked via responses below (expected 400s are fine)
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) consoleErrors.push(m.text().split('\n')[0]);
});
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('response', (r) => {
  if (r.url().startsWith(API_URL) && r.status() >= 400 && r.status() !== 400) {
    unexpectedResponses.push(`${r.status()} ${r.url()}`);
  }
});

// Optional artificial latency for /analyze, to force the race condition, and
// a switch to make the idle preset prefetch fail (so clicks use /analyze)
let analyzeDelayMs = 0;
let blockPrefetch = false;
const browserRequests = []; // as sent by the page (incl. ones aborted before reaching the mock)
await page.setRequestInterception(true);
page.on('request', async (req) => {
  if (req.url().startsWith(API_URL)) browserRequests.push(new URL(req.url()).pathname);
  if (blockPrefetch && req.url().includes('/api/portfolio/prefetch')) {
    req.abort().catch(() => {});
    return;
  }
  if (analyzeDelayMs && req.url().includes('/api/portfolio/analyze') && req.method() === 'POST') {
    await sleep(analyzeDelayMs);
  }
  req.continue().catch(() => {});
});
// Capture CSV downloads (blob links) instead of saving files
await page.evaluateOnNewDocument(() => {
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function patchedClick() {
    if (this.download && this.href.startsWith('blob:')) {
      window.__downloads = window.__downloads ?? [];
      const entry = { name: this.download, text: null };
      window.__downloads.push(entry);
      fetch(this.href).then((r) => r.text()).then((t) => { entry.text = t; });
      return undefined;
    }
    return click.call(this);
  };
});

const rows = () => page.$$eval('.stats-row', (trs) => trs.map((tr) => ({
  name: tr.querySelector('.portfolio-name')?.textContent.trim(),
  total: tr.querySelector('td[data-label="Total return"]')?.textContent.trim(),
  annualized: tr.querySelector('td[data-label="Annualized"]')?.textContent.trim(),
})));
const names = async () => (await rows()).map((r) => r.name);
/** API calls made by the page (the idle preset prefetch has its own /prefetch path). */
const calls = (path) => requestLog.filter((r) => r.path === `/api/portfolio/${path}`);
const isPrefetch = (r) => r.path === '/api/portfolio/prefetch';
const footnote = () => page.$eval('.stats-footnote', (e) => e.textContent.replace(/\s+/g, ' '));
const removePreset = (name) => page.evaluate((n) => {
  const b = [...document.querySelectorAll('.portfolio-chips-right .portfolio-chip-unified.active')]
    .find((e) => e.textContent.includes(n));
  if (!b) throw new Error(`active preset "${n}" not found`);
  b.click();
}, name);
const waitIdle = async () => {
  await sleep(150);
  await page.waitForFunction(
    () => !document.querySelector('[aria-busy="true"], .results-progress'),
    { timeout: 15_000 },
  );
  await sleep(150);
};
const alerts = () => page.$$eval('[role="alert"]', (els) => els.map((e) => e.textContent.trim()));
const clickButton = (scope, text) => page.evaluate((scope, text) => {
  const b = [...document.querySelectorAll(`${scope} button`)].find((e) => e.textContent.trim() === text);
  if (!b) throw new Error(`button "${text}" not found in ${scope}`);
  b.click();
}, scope, text);
const setDate = (id, value) => page.evaluate((id, value) => {
  const el = document.getElementById(id);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, id, value);
const setRange = async (start, end) => {
  await setDate('start-date', start);
  await setDate('end-date', end);
  await waitIdle();
};
const activeIs = (selector) => page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector);
const tooltipOf = (selector) => page.$eval(selector, (b) => {
  const tip = document.getElementById(b.getAttribute('aria-describedby'));
  return tip && !tip.hidden;
});
/** Pick a symbol in the focused combobox using only the keyboard. */
const pickSymbolByKeyboard = async (query, symbol) => {
  await page.keyboard.type(query);
  await page.waitForFunction(
    (s) => [...document.querySelectorAll('[role="listbox"] [role="option"]')].some((o) => o.textContent.includes(s)),
    { timeout: 5_000 }, symbol,
  );
  const index = await page.$$eval('[role="listbox"] [role="option"]',
    (opts, s) => opts.findIndex((o) => o.querySelector('.symbol-ticker')?.textContent === s), symbol);
  for (let i = 0; i <= index; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
};
const replaceText = async (selector, text) => {
  const el = await page.$(selector);
  await el.focus();
  await el.evaluate((e) => e.select());
  await page.keyboard.press('Backspace');
  if (text) await el.type(text);
};
const closeDialog = () => page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10_000 });
/** Add a custom portfolio through the dialog, keyboard only after opening it. */
async function addCustom(name, query, symbol) {
  await page.focus('.add-custom-btn');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
  assert.ok(await activeIs('[role="dialog"] input'), 'dialog focuses its first field');
  await replaceText('[role="dialog"] .form-group input', name);
  await page.keyboard.press('Tab');
  assert.ok(await activeIs('[role="combobox"]'), 'Tab moves to the ticker combobox');
  await pickSymbolByKeyboard(query, symbol);
  await page.keyboard.press('Tab');
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await closeDialog();
  await waitIdle();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('loads the default portfolios from the backend', async () => {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.stats-row', { timeout: 15_000 });
  await waitIdle();
  assert.deepEqual(await names(), ['S&P 500', 'Developed Markets ex-US', 'Emerging Markets']);
  assert.ok(requestLog.some((r) => r.path === '/api/portfolio/compare'),
    `the page did not call the mock backend; build with NEXT_PUBLIC_API_URL=${API_URL}`);
});

test('preset prefetch: one batched /prefetch after idle, then preset clicks skip the network', async () => {
  await page.waitForFunction(() => true);
  for (let i = 0; i < 60 && !requestLog.some(isPrefetch); i++) await sleep(100);
  const prefetches = requestLog.filter(isPrefetch);
  assert.equal(prefetches.length, 1, 'exactly one prefetch request');
  assert.deepEqual(prefetches[0].body.portfolios.map((p) => p.name).sort(),
    ['Bitcoin', 'Gold', 'NASDAQ 100', 'Volatility'], 'prefetches every preset not shown');
  await sleep(300); // let the response land
  const before = requestLog.length;
  await clickButton('.portfolio-chips-right', '+ Gold');
  await page.waitForFunction(() => [...document.querySelectorAll('.stats-row .portfolio-name')].some((e) => e.textContent.includes('Gold')));
  await waitIdle();
  assert.deepEqual(requestLog.slice(before).filter((r) => r.path !== '/health').map((r) => r.path), [], 'adding a prefetched preset makes no request');
  await removePreset('Gold');
  await waitIdle();
});

test('race: adding a preset while the range changes keeps it, on the new range', async () => {
  // A new query (and no prefetch) so the preset click goes through /analyze
  blockPrefetch = true;
  await clickButton('.range-presets', '5Y');
  await waitIdle();
  analyzeDelayMs = 1500;
  await clickButton('.portfolio-chips-right', '+ NASDAQ 100');
  await sleep(200);
  await clickButton('.range-presets', '1Y');
  await sleep(analyzeDelayMs + 300);
  await waitIdle();
  analyzeDelayMs = 0;

  const shown = await rows();
  assert.deepEqual(shown.map((r) => r.name), ['S&P 500', 'Developed Markets ex-US', 'Emerging Markets', 'NASDAQ 100']);
  // The stale single-portfolio analysis was folded into the range refresh
  assert.ok(browserRequests.includes('/api/portfolio/analyze'), 'the preset click used /analyze');
  const lastCompare = calls('compare').at(-1);
  assert.ok(lastCompare.body.portfolios.some((p) => p.name === 'NASDAQ 100'), 'refresh included the pending preset');
  const start = await page.$eval('#start-date', (e) => e.value);
  const end = await page.$eval('#end-date', (e) => e.value);
  const expected = await (await fetch(`${API_URL}/api/portfolio/compare`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_date: start, end_date: end, currency: 'USD',
      portfolios: [['S&P 500', 'VOO'], ['Developed Markets ex-US', 'VEA'], ['Emerging Markets', 'VWO'], ['NASDAQ 100', 'QQQ']]
        .map(([name, symbol]) => ({ name, assets: [{ symbol, weight: 1 }] })),
    }),
  })).json();
  for (const { stats } of expected.portfolios) {
    const row = shown.find((r) => r.name === stats.name);
    const pct = `${(stats.total_return * 100).toFixed(2)}%`;
    assert.equal(row.total.replace('\u2212', '-').replace('+', ''), pct, `${stats.name} shows the new range's total return`);
  }
});

test('short ranges: "—" under a year, 2 days render, 1 day gives a clean error', async () => {
  await setRange('2025-06-02', '2025-09-01');
  const underYear = await rows();
  assert.ok(underYear.length > 0 && underYear.every((r) => r.annualized === '—'), 'annualized return shows "—"');

  await setRange('2024-03-04', '2024-03-05');
  assert.equal((await rows()).length, 4, '2-day range still renders every row');
  assert.ok(await page.$('.recharts-line-curve'), 'chart renders for 2 days');

  await setDate('start-date', '2024-03-01');
  await setDate('end-date', '2024-03-02');
  await waitIdle();
  assert.ok((await alerts()).some((t) => t.includes('Not enough trading days')), 'clean error for 1 trading day');
  assert.deepEqual(pageErrors, [], 'no uncaught errors');

  await clickButton('.range-presets', '3Y');
  await waitIdle();
  assert.equal((await rows()).length, 4);
});

test('rebalance: the select changes the request, footnote and share link', async () => {
  const before = calls('compare').length;
  await page.select('#rebalance', 'monthly');
  await waitIdle();
  const sent = calls('compare').slice(before);
  assert.ok(sent.length > 0 && sent.at(-1).body.rebalance === 'monthly', 'refresh sent rebalance=monthly');
  assert.match(await footnote(), /Rebalanced monthly/);
  await page.waitForFunction(() => window.location.search.includes('r=monthly'), { timeout: 2_000 })
    .catch(() => assert.fail(`share link lacks r=monthly: ${page.url()}`));
  await page.select('#rebalance', 'none');
  await waitIdle();
  assert.equal(calls('compare').at(-1).body.rebalance, 'none');
  assert.match(await footnote(), /Buy-and-hold/);
});

test('align start dates: shown when starts differ, on by default, toggling re-queries', async () => {
  assert.equal(await page.$('.align-control input'), null, 'no align control while starts match');
  await clickButton('.portfolio-chips-right', '+ Bitcoin'); // IBIT starts trading later
  await waitIdle();
  await page.waitForSelector('.align-control input', { timeout: 5_000 });
  assert.ok(await page.$eval('.align-control input', (e) => e.checked), 'aligned by default');
  assert.match(await footnote(), /aligned to Jan 11, 2024/);
  const before = calls('compare').length;
  await page.click('.align-control input');
  await waitIdle();
  assert.equal(calls('compare').slice(before).at(-1)?.body.align_start, false, 'unchecking re-queries unaligned');
  assert.doesNotMatch(await footnote(), /aligned to/);
  await page.click('.align-control input');
  await waitIdle();
  assert.match(await footnote(), /aligned to Jan 11, 2024/);
  await removePreset('Bitcoin');
  await waitIdle();
  assert.equal(await page.$('.align-control input'), null, 'align control hides again');
  assert.doesNotMatch(await footnote(), /aligned to/, 'removing the late starter drops the alignment');
});

test('drawdown view: deepest drawdown per portfolio equals the table\'s Max DD', async () => {
  await clickButton('.chart-view-toggle', 'Drawdown');
  await page.waitForSelector('[data-testid="drawdown-summary"]', { timeout: 5_000 });
  const deepest = JSON.parse(await page.$eval('[data-testid="drawdown-summary"]', (e) => e.dataset.deepest));
  const table = await page.$$eval('.stats-row', (trs) => Object.fromEntries(trs.map((tr) => [
    tr.querySelector('.portfolio-name').textContent.trim(),
    tr.querySelector('td[data-label="Max drawdown"]').textContent.trim(),
  ])));
  for (const [name, text] of Object.entries(table)) {
    const shown = parseFloat(text.replace('\u2212', '-')) / 100;
    assert.ok(Math.abs(deepest[name] - shown) < 0.0001, `${name}: chart ${deepest[name]} vs table ${shown}`);
  }
  await clickButton('.chart-view-toggle', 'Growth');
  await page.waitForSelector('.recharts-line-curve');
});

test('CSV export: downloads the current view with every portfolio', async () => {
  await page.click('.csv-btn');
  await page.waitForFunction(() => window.__downloads?.[0]?.text != null, { timeout: 5_000 });
  const [file] = await page.evaluate(() => window.__downloads);
  assert.match(file.name, /\.csv$/);
  for (const name of await names()) assert.ok(file.text.includes(name), `CSV includes ${name}`);
  assert.ok(file.text.split('\n').length > 50, 'CSV includes daily values');
});

test('custom portfolios: ticker edit, name collision, rename in place, Esc + focus return', async () => {
  await addCustom('Mine', 'VT', 'VTI');
  assert.ok(await activeIs('.add-custom-btn'), 'focus returns to "+ Custom Portfolio"');
  await addCustom('Other', 'MS', 'MSFT');
  const before = await names();
  assert.deepEqual(before.slice(-2), ['Mine', 'Other']);

  // Esc closes the edit dialog and returns focus to the chip
  await page.evaluate(() => [...document.querySelectorAll('.chip-name')].find((b) => b.textContent === 'Mine').focus());
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
  await page.keyboard.press('Escape');
  await closeDialog();
  assert.ok(await page.evaluate(() => document.activeElement?.textContent === 'Mine'), 'focus returns to the chip');

  // Typing into an already-selected ticker must not wipe it
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
  await page.focus('[role="dialog"] [role="combobox"]');
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await sleep(400);
  assert.equal(await page.$eval('[role="dialog"] [role="combobox"]', (e) => e.value), 'VTIX');
  // Esc closes only the suggestion list, not the dialog
  await page.keyboard.press('Escape');
  assert.ok(await page.$('[role="dialog"]'), 'Esc in the combobox keeps the dialog open');
  await replaceText('[role="dialog"] [role="combobox"]', '');
  await pickSymbolByKeyboard('VT', 'VTI');

  // Colliding name is rejected inline
  await replaceText('[role="dialog"] .form-group input', 'Other');
  await page.click('[role="dialog"] .submit-btn');
  await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="alert"]'));
  assert.match(await page.$eval('[role="dialog"] [role="alert"]', (e) => e.textContent), /already exists/);
  assert.deepEqual(await names(), before);

  // Real rename replaces the original in place
  await replaceText('[role="dialog"] .form-group input', 'Renamed');
  await page.click('[role="dialog"] .submit-btn');
  await closeDialog();
  await waitIdle();
  const after = await names();
  assert.deepEqual(after, before.map((n) => (n === 'Mine' ? 'Renamed' : n)));

  // A non-USD holding is flagged as not converted
  await addCustom('Japan', '72', '7203.T');
  assert.match(await footnote(), /JPY/);
});

test('keyboard and ARIA basics: tooltips, labelled focus stops with a visible indicator', async () => {
  await page.focus('.stats-table .info-icon');
  assert.ok(await tooltipOf('.stats-table .info-icon'), 'tooltip opens on focus');
  await page.keyboard.press('Escape');
  assert.ok(!(await tooltipOf('.stats-table .info-icon')), 'Esc closes the tooltip');

  await page.focus('.disclaimer-link');
  assert.ok(await tooltipOf('.disclaimer-link'), 'disclaimer opens on focus');
  await page.keyboard.press('Tab');
  assert.ok(!(await tooltipOf('.disclaimer-link')), 'disclaimer closes on blur');

  // Every Tab stop from the top has an accessible name and a focus indicator
  await page.evaluate(() => document.activeElement?.blur());
  const problems = [];
  let visited = 0;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const inspect = () => page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
        || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.textContent.trim();
      const cs = getComputedStyle(el);
      // A date input's calendar button is a separate Tab stop inside the
      // input; Chrome draws its own focus ring there (host is not :focus)
      const pickerButton = el.type === 'date' && !el.matches(':focus');
      const indicator = pickerButton || cs.outlineStyle !== 'none' || cs.boxShadow !== 'none';
      return { tag: el.tagName, id: el.id, text: el.textContent.trim().slice(0, 30), labelled: Boolean(labelled), indicator };
    });
    let stop = await inspect();
    // Box-shadow focus styles transition in; re-check once they've settled
    if (stop && !stop.indicator) { await sleep(250); stop = await inspect(); }
    if (!stop) break;
    visited++;
    if (!stop.labelled || !stop.indicator) problems.push(stop);
  }
  assert.ok(visited >= 20, `expected at least 20 Tab stops, reached ${visited}`);
  assert.deepEqual(problems, [], 'unlabelled focus stops or stops without a focus indicator');
});

test('empty state appears when every portfolio is removed, and a preset can be added from it', async () => {
  for (let i = 0; i < 10 && (await rows()).length > 0; i++) {
    await page.evaluate(() => {
      const custom = document.querySelector('.chip-remove');
      const preset = document.querySelector('.portfolio-chips-right .portfolio-chip-unified.active');
      (custom ?? preset)?.click();
    });
    await sleep(100);
  }
  await page.waitForSelector('.empty-state', { timeout: 5_000 });
  assert.match(await page.$eval('.empty-state h2', (e) => e.textContent), /No portfolios/);
  await clickButton('.empty-state', '+ S&P 500');
  await page.waitForSelector('.stats-row', { timeout: 10_000 });
  await waitIdle();
  assert.deepEqual(await names(), ['S&P 500']);
});

test('no console errors, uncaught errors or unexpected API failures', async () => {
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(unexpectedResponses, []);
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const started = Date.now();
let failed = 0;
for (const { name, fn } of tests) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`ok   ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name} (${Date.now() - t0} ms)\n     ${String(err.message).split('\n').join('\n     ')}`);
    const shot = resolve(process.env.SMOKE_ARTIFACTS ?? tmpdir(), `smoke-failure-${failed}.png`);
    await page.screenshot({ path: shot }).then(() => console.log(`     screenshot: ${shot}`), () => {});
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
clearTimeout(watchdog);
await cleanup();
process.exit(failed ? 1 : 0);
