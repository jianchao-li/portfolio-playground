export const formatPercent = (value: number, decimals = 2): string =>
  `${(value * 100).toFixed(decimals)}%`;

export const getValueClass = (value: number): 'positive' | 'negative' =>
  value >= 0 ? 'positive' : 'negative';
