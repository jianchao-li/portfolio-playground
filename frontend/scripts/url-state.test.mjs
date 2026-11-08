// Unit tests for src/lib/urlState.ts (shareable URL state).
// Usage: npm run test:url   (Node >= 22.18 / 23.6, which runs .ts directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseUrlState, serializeUrlState, sanitizeName, alignParam,
  MAX_PORTFOLIOS, MAX_TOTAL_ASSETS, MAX_NAME_LENGTH,
} from '../src/lib/urlState.ts';

const currencies = JSON.parse(readFileSync(new URL('../src/lib/currencies.json', import.meta.url)));
const presets = [
  { name: 'S&P 500', assets: [{ symbol: 'VOO', weight: 1 }] },
  { name: 'NASDAQ 100', assets: [{ symbol: 'QQQ', weight: 1 }] },
  { name: 'Developed Markets ex-US', assets: [{ symbol: 'VEA', weight: 1 }] },
  { name: 'Gold', assets: [{ symbol: 'GLD', weight: 1 }] },
];
const defaults = [presets[0], presets[2]];
const config = {
  presets,
  currencies: new Set(currencies.map((c) => c.code)),
  defaultStartDate: '2023-01-01',
  defaultCurrency: 'USD',
  today: '2026-11-08',
};
const parse = (q) => parseUrlState(q, config);
const serialize = (s) => serializeUrlState(s, defaults, config);
const sumWeights = (p) => p.assets.reduce((a, x) => a + x.weight, 0);

test('default view serializes to an empty query', () => {
  assert.equal(serialize({ portfolios: defaults, startDate: '2023-01-01', endDate: '2026-11-08', currency: 'USD' }), '');
});

test('preset-only state gives a short URL', () => {
  const q = serialize({ portfolios: [presets[0], presets[3]], startDate: '2023-01-01', endDate: '2026-11-08', currency: 'USD' });
  assert.equal(q, '?v=1&p=@VOO&p=@GLD&e=2026-11-08');
});

test('round trip: custom portfolio + presets + JPY + dates', () => {
  const state = {
    portfolios: [
      presets[1],
      { name: 'My 60/40 & co', assets: [{ symbol: 'VOO', weight: 0.6 }, { symbol: 'BND', weight: 0.25 }, { symbol: '7203.T', weight: 0.15 }] },
      { name: 'Thirds', assets: [{ symbol: 'A', weight: 1 / 3 }, { symbol: 'B', weight: 1 / 3 }, { symbol: 'C', weight: 1 / 3 }] },
    ],
    startDate: '2023-11-08', endDate: '2026-11-08', currency: 'JPY',
  };
  const q = serialize(state);
  assert.match(q, /^\?v=1&p=@QQQ&p=My/);
  const back = parse(q);
  assert.equal(back.startDate, state.startDate);
  assert.equal(back.endDate, state.endDate);
  assert.equal(back.currency, 'JPY');
  assert.deepEqual(back.portfolios.map((p) => p.name), state.portfolios.map((p) => p.name));
  back.portfolios.forEach((p, i) => {
    assert.deepEqual(p.assets.map((a) => a.symbol), state.portfolios[i].assets.map((a) => a.symbol));
    p.assets.forEach((a, j) => assert.ok(Math.abs(a.weight - state.portfolios[i].assets[j].weight) < 1e-6));
    assert.ok(Math.abs(sumWeights(p) - 1) < 1e-12);
  });
});

test('no params or unknown version: null (keep defaults)', () => {
  assert.equal(parse(''), null);
  assert.equal(parse('?p=@VOO'), null);
  assert.equal(parse('?v=2&p=@VOO'), null);
});

test('weights are clamped and normalized; bad assets dropped; duplicates merged', () => {
  const s = parse('?v=1&p=X~voo:1e9,BND:50,bad$sym:10,QQQ:-5,GLD:NaN,BND:50');
  const [p] = s.portfolios;
  assert.deepEqual(p.assets.map((a) => a.symbol), ['VOO', 'BND']);
  assert.ok(Math.abs(p.assets[0].weight - 0.5) < 1e-12); // 1e9 clamped to 100, BND 50+50
  assert.equal(sumWeights(p), 1);
  assert.equal(parse('?v=1&p=Zero~VOO:0').portfolios.length, 0);
  assert.equal(parse('?v=1&p=NoAssets').portfolios.length, 0);
});

test('names are sanitized, length-limited, unique and distinct from presets', () => {
  const s = parse(`?v=1&p=${encodeURIComponent('<script>alert(1)</script>~VOO:1')}`
    + `&p=${encodeURIComponent('x'.repeat(200) + '~VOO:1')}`
    + '&p=Gold~VOO:1&p=Dup~VOO:1&p=Dup~QQQ:1&p=%20%20~VOO:1&p=@GLD&p=@GLD&p=@NOPE');
  const names = s.portfolios.map((p) => p.name);
  assert.equal(names[0], 'scriptalert(1)/script');
  assert.equal(names[1].length, MAX_NAME_LENGTH);
  assert.deepEqual(names.slice(2), ['Gold (custom)', 'Dup', 'Dup (2)', 'Gold']);
  assert.equal(sanitizeName('a\u0000\n b'), 'a b');
});

test('portfolio and asset counts are capped at the backend limits', () => {
  const many = Array.from({ length: 500 }, (_, i) => `p=P${i}~VOO:1`).join('&');
  assert.equal(parse(`?v=1&${many}`).portfolios.length, MAX_PORTFOLIOS);
  const wide = Array.from({ length: 30 }, (_, i) => `S${i}:1`).join(',');
  const s = parse(`?v=1&p=A~${wide}&p=B~${wide}&p=C~${wide}`);
  const total = s.portfolios.reduce((a, p) => a + p.assets.length, 0);
  assert.ok(total <= MAX_TOTAL_ASSETS);
  assert.ok(s.portfolios.every((p) => p.assets.length <= 20));
});

test('dates: invalid, future, reversed and too-long ranges are fixed', () => {
  const d = (q) => { const s = parse(`?v=1${q}`); return [s.startDate, s.endDate]; };
  assert.deepEqual(d('&s=garbage&e=2025-02-30'), ['2023-01-01', '2026-11-08']);
  assert.deepEqual(d('&s=2024-01-01&e=2099-01-01'), ['2024-01-01', '2026-11-08']);
  assert.deepEqual(d('&s=2025-06-01&e=2025-01-01'), ['2023-01-01', '2025-01-01']);
  assert.deepEqual(d('&s=2022-06-01&e=2022-01-01'), ['2021-01-01', '2022-01-01']);
  const [start, end] = d('&s=1900-01-01&e=2026-11-08');
  assert.equal(end, '2026-11-08');
  assert.equal((Date.parse(end) - Date.parse(start)) / 86400000, 25 * 365);
});

test('currency must be supported; lowercase accepted', () => {
  assert.equal(parse('?v=1&c=XYZ').currency, 'USD');
  assert.equal(parse('?v=1&c=<b>').currency, 'USD');
  assert.equal(parse('?v=1&c=jpy').currency, 'JPY');
});

test('custom names starting with @ or \\ round-trip (not read as presets)', () => {
  const state = {
    portfolios: [
      { name: '@VOO', assets: [{ symbol: 'QQQ', weight: 1 }] },
      { name: '@home fund', assets: [{ symbol: 'VOO', weight: 0.5 }, { symbol: 'GLD', weight: 0.5 }] },
      { name: '\\back', assets: [{ symbol: 'VOO', weight: 1 }] },
      { name: 'mid@dle', assets: [{ symbol: 'VOO', weight: 1 }] },
    ],
    startDate: '2023-01-01', endDate: '2026-11-08', currency: 'USD',
  };
  const q = serialize(state);
  assert.ok(!q.includes('p=@VOO'), q);
  const back = parse(q);
  assert.deepEqual(back.portfolios.map((p) => p.name), ['@VOO', '@home fund', '\\back', 'mid@dle']);
  assert.deepEqual(back.portfolios[0].assets, [{ symbol: 'QQQ', weight: 1 }]);
  // A real preset is still written and read as @SYMBOL
  assert.equal(parse(serialize({ ...state, portfolios: [presets[3]] })).portfolios[0].name, 'Gold');
});

test('a name of exactly MAX_NAME_LENGTH survives; longer names are cut, not renamed', () => {
  const name = 'n'.repeat(MAX_NAME_LENGTH);
  const state = { portfolios: [{ name, assets: [{ symbol: 'VOO', weight: 1 }] }], startDate: '2023-01-01', endDate: '2026-11-08', currency: 'USD' };
  assert.equal(parse(serialize(state)).portfolios[0].name, name);
  assert.equal(parse(`?v=1&p=${'m'.repeat(60)}~VOO:1`).portfolios[0].name, 'm'.repeat(MAX_NAME_LENGTH));
});

test('a= is only written while start dates differ (alignment can matter)', () => {
  assert.equal(alignParam(true, true), true);
  assert.equal(alignParam(false, true), false);
  assert.equal(alignParam(undefined, true), undefined);
  // e.g. after removing the late starter: drop the leftover choice
  assert.equal(alignParam(true, false), undefined);
  assert.equal(alignParam(false, false), undefined);
  const base = { portfolios: [presets[0]], startDate: '2023-01-01', endDate: '2026-11-08', currency: 'USD' };
  assert.ok(!serialize({ ...base, alignStart: alignParam(true, false) }).includes('a='));
  assert.ok(serialize({ ...base, alignStart: alignParam(true, true) }).includes('a=1'));
});

test('a= (align start dates) is optional and round-trips', () => {
  const base = { portfolios: [presets[0]], startDate: '2023-01-01', endDate: '2026-11-08', currency: 'USD' };
  assert.equal(parse(serialize(base)).alignStart, undefined);
  assert.ok(!serialize(base).includes('a='));
  assert.equal(parse(serialize({ ...base, alignStart: true })).alignStart, true);
  assert.equal(parse(serialize({ ...base, alignStart: false })).alignStart, false);
  assert.equal(parse('?v=1&a=yes').alignStart, undefined);
  // Explicit alignment makes even the default portfolios a non-default view
  assert.notEqual(serialize({ portfolios: defaults, startDate: '2023-01-01', endDate: '2026-11-08', currency: 'USD', alignStart: false }), '');
});

test('r= (rebalancing) is omitted for none and round-trips', () => {
  const base = { portfolios: [presets[0]], startDate: '2023-01-01', endDate: '2026-11-08', currency: 'USD' };
  assert.ok(!serialize(base).includes('r='));
  for (const r of ['monthly', 'quarterly', 'annually']) {
    const q = serialize({ ...base, rebalance: r });
    assert.ok(q.includes(`r=${r}`), q);
    assert.equal(parse(q).rebalance, r);
  }
  assert.equal(parse('?v=1&r=weekly').rebalance, undefined);
  assert.equal(parse('?v=1&r=ANNUALLY').rebalance, 'annually');
  assert.equal(parse('?v=1').rebalance, undefined);
  // Rebalancing makes even the default portfolios a non-default view
  assert.notEqual(serialize({ portfolios: defaults, startDate: '2023-01-01', endDate: '2026-11-08', currency: 'USD', rebalance: 'monthly' }), '');
});
