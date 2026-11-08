/** Placeholder shown for metrics the backend could not compute (null/NaN). */
export const MISSING_VALUE = '—';

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const formatPercent = (
  value: number | null | undefined,
  decimals = 2,
  fallback = MISSING_VALUE
): string =>
  isFiniteNumber(value) ? `${(value * 100).toFixed(decimals)}%` : fallback;

export const formatNumber = (
  value: number | null | undefined,
  decimals = 2,
  fallback = MISSING_VALUE
): string =>
  isFiniteNumber(value) ? value.toFixed(decimals) : fallback;
