// Mid-luminance series palette: every colour has >= 3.6:1 contrast against
// white (WCAG 1.4.11 for graphical marks). Ordered so the first few series
// stay distinguishable for common colour-vision deficiencies.
export const PORTFOLIO_COLORS = [
  '#2563eb', // blue    5.17:1
  '#d9640b', // orange  3.63:1
  '#2e8b3e', // green   4.30:1
  '#7c4dbd', // purple  5.75:1
  '#c8323b', // red     5.28:1
  '#0e8299', // cyan    4.50:1
  '#8c564b', // brown   5.92:1
  '#c2449f', // pink    4.54:1
  '#7a7a14', // olive   4.54:1
  '#6b7280', // grey    4.83:1
];

// Asset slices in the allocation donut use the same palette for consistency.
export const PIE_CHART_COLORS = PORTFOLIO_COLORS;

export function getPortfolioColor(index: number): string {
  return PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length];
}

export function getPieChartColor(index: number): string {
  return PIE_CHART_COLORS[index % PIE_CHART_COLORS.length];
}
