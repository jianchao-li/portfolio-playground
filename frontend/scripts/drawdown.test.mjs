// Unit tests for src/lib/drawdown.ts (chart Drawdown view).
// Usage: node --no-warnings --test scripts/drawdown.test.mjs   (Node >= 22.18 / 23.6)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawdownSeries, maxDrawdown } from '../src/lib/drawdown.ts';

const close = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-12);

test('drawdown from the running peak, 0 at new highs', () => {
  const dd = drawdownSeries([100, 110, 99, 121, 60.5, 121]);
  assert.ok(close(dd, [0, 0, -0.1, 0, -0.5, 0]), String(dd));
  assert.equal(maxDrawdown([100, 110, 99, 121, 60.5, 121]), -0.5);
});

test('the first value is the starting peak (backend convention)', () => {
  assert.ok(close(drawdownSeries([100, 90, 95]), [0, -0.1, -0.05]));
  assert.ok(Math.abs(maxDrawdown([100, 90, 95]) + 0.1) < 1e-12);
});

test('rising, flat, single and empty series have no drawdown', () => {
  assert.equal(maxDrawdown([100, 101, 102]), 0);
  assert.equal(maxDrawdown([100, 100, 100]), 0);
  assert.equal(maxDrawdown([100]), 0);
  assert.equal(maxDrawdown([]), 0);
  assert.deepEqual(drawdownSeries([]), []);
});

test('matches the backend max_drawdown formula on a random walk', () => {
  // Backend: growth = cumprod(1 + returns); peak = cummax(growth) clipped at 1.0;
  // max_drawdown = min(growth / peak) - 1 (capped at 0)
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const values = [100];
  for (let i = 0; i < 1000; i++) values.push(values.at(-1) * (1 + (rand() - 0.5) * 0.04));
  let growth = 1, peak = 1, worst = 1;
  for (let i = 1; i < values.length; i++) {
    growth *= values[i] / values[i - 1];
    peak = Math.max(peak, growth);
    worst = Math.min(worst, growth / peak);
  }
  assert.ok(Math.abs(maxDrawdown(values) - (Math.min(worst, 1) - 1)) < 1e-12);
});
