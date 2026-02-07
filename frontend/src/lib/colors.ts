export const PORTFOLIO_COLORS = [
  '#3ecfb2', '#e74c3c', '#9b59b6', '#f39c12', '#3498db', '#1abc9c', '#e91e63'
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
