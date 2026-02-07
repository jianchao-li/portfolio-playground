export const PORTFOLIO_COLORS = [
  '#3ecfb2', '#e74c3c', '#9b59b6', '#f39c12', '#3498db', '#1abc9c', '#e91e63'
];

export function getPortfolioColor(index: number): string {
  return PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length];
}
