// Unit tests for src/lib/landingPages.ts and src/lib/summary.ts (SEO landing pages).
// Usage: node --no-warnings --test scripts/landing.test.mjs   (Node >= 22.18 / 23.6)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANDING_PAGES, landingPath, relatedLandings } from '../src/lib/landingPages.ts';
import { PRESET_PORTFOLIOS } from '../src/lib/presets.ts';
import { summarizeComparison } from '../src/lib/summary.ts';
import { MAX_NAME_LENGTH } from '../src/lib/urlState.ts';

test('landing paths are unique, lowercase slugs', () => {
  const paths = LANDING_PAGES.map(landingPath);
  assert.equal(new Set(paths).size, paths.length);
  for (const p of LANDING_PAGES) assert.match(p.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, p.slug);
});

test('each "a-vs-b" pair appears in one order only', () => {
  const pairs = LANDING_PAGES.filter((p) => p.kind === 'compare')
    .map((p) => p.slug.split('-vs-').sort().join('|'));
  assert.equal(new Set(pairs).size, pairs.length);
});

test('related links resolve and never point to the page itself', () => {
  for (const p of LANDING_PAGES) {
    assert.equal(relatedLandings(p).length, p.related.length, `${p.slug}: ${p.related}`);
    assert.ok(!relatedLandings(p).includes(p), p.slug);
  }
});

test('portfolios are valid for the backend and URL state', () => {
  const presetNames = new Map(PRESET_PORTFOLIOS.map((p) => [p.name, p]));
  for (const page of LANDING_PAGES) {
    assert.ok(page.portfolios.length >= 2, page.slug);
    const names = page.portfolios.map((p) => p.name);
    assert.equal(new Set(names).size, names.length, page.slug);
    for (const p of page.portfolios) {
      assert.ok(p.name.length <= MAX_NAME_LENGTH, p.name);
      const total = p.assets.reduce((a, x) => a + x.weight, 0);
      assert.ok(Math.abs(total - 1) < 1e-9, `${p.name} weights sum to ${total}`);
      // A preset's name must keep the preset's holdings (links serialize it as @SYMBOL)
      const preset = presetNames.get(p.name);
      if (preset) assert.deepEqual(p.assets, preset.assets, p.name);
    }
    assert.match(page.startDate, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('search snippets fit: titles and descriptions within limits', () => {
  for (const p of LANDING_PAGES) {
    assert.ok(p.title.length <= 50, `${p.slug} title is ${p.title.length} chars`);
    assert.ok(p.description.length >= 100 && p.description.length <= 160,
      `${p.slug} description is ${p.description.length} chars`);
    assert.ok(p.intro.length >= 2, `${p.slug} needs hand-written context`);
  }
});

const stats = (name, total, annual, dd, sharpe) => ({
  name, total_return: total, annualized_return: annual, volatility: 0.2,
  sharpe_ratio: sharpe, sortino_ratio: null, max_drawdown: dd,
});

test('summary states the leader, drawdowns and best Sharpe', () => {
  const text = summarizeComparison(
    [stats('S&P 500', 3.5, 0.14, -0.34, 0.8), stats('NASDAQ 100', 6, 0.19, -0.35, 0.9)],
    '2011-01-03', '2026-11-19',
  );
  assert.equal(text,
    'From January 2011 to November 2026, NASDAQ 100 returned 19.0% a year (600% in total), ' +
    'compared with 14.0% a year (350% in total) for S&P 500. ' +
    'The worst peak-to-trough falls were 34.0% for S&P 500 and 35.0% for NASDAQ 100. ' +
    'On a risk-adjusted basis, NASDAQ 100 had the higher Sharpe ratio (0.90).');
});

test('summary handles short ranges, losses and missing Sharpe', () => {
  const text = summarizeComparison(
    [stats('Gold', 0.05, null, -0.1, null), stats('Bitcoin', -0.2, null, -0.4, 0.1)],
    '2026-03-02', '2026-09-30',
  );
  assert.match(text, /^From March 2026 to September 2026, Gold returned 5\.0%, compared with −20\.0% for Bitcoin\./);
  assert.doesNotMatch(text, /Sharpe/);
  assert.equal(summarizeComparison([stats('Solo', 1, 0.1, -0.2, 1)], '2020-01-01', '2021-01-01'), null);
});
