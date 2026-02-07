export const PORTFOLIO_COLORS = [
  '#3ecfb2', // teal
  '#e74c3c', // red
  '#9b59b6', // purple
  '#f39c12', // orange
  '#3498db', // blue
  '#1abc9c', // green
  '#e91e63', // pink
  '#795548', // brown
  '#607d8b', // blue-grey
  '#ff5722', // deep orange
  '#00bcd4', // cyan
  '#8bc34a', // light green
];

export const PIE_CHART_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
];

export function getPortfolioColor(index: number): string {
  return PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length];
}

export function getPieChartColor(index: number): string {
  return PIE_CHART_COLORS[index % PIE_CHART_COLORS.length];
}
