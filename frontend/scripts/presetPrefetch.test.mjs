// Unit tests for src/lib/presetPrefetch.ts (C5 idle preset prefetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prefetchKey, assetsSignature, presetsToPrefetch, prefetchBody, emptyStore, storeBatch,
  lookup, backoffAfter, canPrefetch, RATE_LIMIT_BACKOFF_MS,
} from '../src/lib/presetPrefetch.ts';

const q = { startDate: '2023-01-01', endDate: '2026-11-08', currency: 'USD', align: true, rebalance: 'none' };
const PRESETS = [
  { name: 'S&P 500', assets: [{ symbol: 'VOO', weight: 1 }] },
  { name: 'NASDAQ 100', assets: [{ symbol: 'QQQ', weight: 1 }] },
  { name: 'Gold', assets: [{ symbol: 'GLD', weight: 1 }] },
];
const resp = (name) => ({ stats: { name }, performance: { dates: [], values: [] }, currency: 'USD' });

test('key covers dates, currency, align and rebalance', () => {
  const k = prefetchKey(q);
  for (const change of [{ startDate: '2024-01-01' }, { endDate: '2026-11-07' }, { currency: 'EUR' },
    { align: false }, { rebalance: 'monthly' }]) {
    assert.notEqual(prefetchKey({ ...q, ...change }), k, JSON.stringify(change));
  }
  assert.equal(prefetchKey({ ...q }), k);
});

test('only presets that are not shown (incl. ones restored from a shared link)', () => {
  assert.deepEqual(presetsToPrefetch(PRESETS, ['S&P 500', 'My portfolio']).map((p) => p.name), ['NASDAQ 100', 'Gold']);
  assert.deepEqual(presetsToPrefetch(PRESETS, PRESETS.map((p) => p.name)), []);
});

test('batched request body is unaligned, like /analyze, and keeps rebalance', () => {
  const body = JSON.parse(prefetchBody(PRESETS.slice(1), { ...q, rebalance: 'quarterly' }));
  assert.equal(body.align_start, false);
  assert.equal(body.rebalance, 'quarterly');
  assert.deepEqual(body.portfolios.map((p) => p.name), ['NASDAQ 100', 'Gold']);
  assert.equal(body.start_date, q.startDate);
  assert.equal(body.currency, 'USD');
});

test('lookup hits only for the same key and the same holdings', () => {
  const store = storeBatch(prefetchKey(q), PRESETS.slice(1), [resp('NASDAQ 100'), resp('Gold')]);
  assert.equal(lookup(store, prefetchKey(q), PRESETS[1]).stats.name, 'NASDAQ 100');
  assert.equal(lookup(store, prefetchKey({ ...q, currency: 'JPY' }), PRESETS[1]), null); // stale query
  assert.equal(lookup(store, prefetchKey(q), PRESETS[0]), null); // not prefetched
  const edited = { name: 'Gold', assets: [{ symbol: 'GLD', weight: 0.5 }, { symbol: 'SLV', weight: 0.5 }] };
  assert.equal(lookup(store, prefetchKey(q), edited), null); // same name, other holdings
  assert.equal(lookup(emptyStore(), prefetchKey(q), PRESETS[1]), null);
});

test('holdings signature ignores order and case', () => {
  assert.equal(assetsSignature([{ symbol: 'voo', weight: 0.5 }, { symbol: 'BND', weight: 0.5 }]),
    assetsSignature([{ symbol: 'BND', weight: 0.5 }, { symbol: 'VOO', weight: 0.5 }]));
});

test('429 backs off for a minute; other statuses do not', () => {
  assert.equal(backoffAfter(429, 1000), 1000 + RATE_LIMIT_BACKOFF_MS);
  assert.equal(backoffAfter(200, 1000), 0);
  assert.equal(backoffAfter(500, 1000, 5000), 5000);
  const until = backoffAfter(429, 1000);
  assert.equal(canPrefetch({ saveData: false, hidden: false, now: until - 1, backoffUntil: until }), false);
  assert.equal(canPrefetch({ saveData: false, hidden: false, now: until, backoffUntil: until }), true);
});

test('skipped with Save-Data or a hidden tab', () => {
  assert.equal(canPrefetch({ saveData: true, hidden: false, now: 1, backoffUntil: 0 }), false);
  assert.equal(canPrefetch({ saveData: false, hidden: true, now: 1, backoffUntil: 0 }), false);
});
