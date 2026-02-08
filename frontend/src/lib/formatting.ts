export const formatPercent = (value: number, decimals = 2): string =>
  `${(value * 100).toFixed(decimals)}%`;
