/**
 * Drawdown helpers for the chart's Drawdown view, computed client-side from
 * the performance series the backend already returns (no extra request).
 */

/**
 * Drawdown at each point: value / running peak - 1 (0 at a new high, negative
 * below it). The first value counts as the starting peak, which matches the
 * backend's max_drawdown (measured against the starting value).
 */
export function drawdownSeries(values: readonly number[]): number[] {
  const out: number[] = [];
  let peak = -Infinity;
  for (const v of values) {
    if (v > peak) peak = v;
    out.push(peak > 0 ? v / peak - 1 : 0);
  }
  return out;
}

/** Deepest drawdown (most negative value), or 0 for an empty or rising series. */
export function maxDrawdown(values: readonly number[]): number {
  let worst = 0;
  for (const d of drawdownSeries(values)) {
    if (d < worst) worst = d;
  }
  return worst;
}
