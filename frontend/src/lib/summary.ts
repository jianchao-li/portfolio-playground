/**
 * One-paragraph, data-driven summary of a comparison for landing pages, so
 * the server-rendered HTML states the actual result in words. Pure (no
 * runtime imports), so it can be unit-tested with plain Node.
 */
import type { PortfolioStats } from './api';

/** Percent with a typographic minus. */
const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`.replace(/^-/, '\u2212');

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });

/** Summary sentences, or null when there is nothing meaningful to say. */
export function summarizeComparison(
  stats: PortfolioStats[], start: string, end: string
): string | null {
  if (stats.length < 2) return null;
  const period = `From ${longDate(start)} to ${longDate(end)}`;
  const sentences: string[] = [];

  const byGrowth = [...stats].sort((a, b) => b.total_return - a.total_return);
  const annualized = stats.every((s) => s.annualized_return != null);
  const growthText = (s: PortfolioStats) => (annualized
    ? `${pct(s.annualized_return as number)} a year (${pct(s.total_return, 0)} in total)`
    : `${pct(s.total_return)}`);
  const [best, ...rest] = byGrowth;
  sentences.push(
    `${period}, ${best.name} returned ${growthText(best)}, compared with ${rest
      .map((s) => `${growthText(s)} for ${s.name}`)
      .join(' and ')}.`
  );

  // Max drawdown is negative: list from shallowest to deepest
  const byDrawdown = [...stats].sort((a, b) => b.max_drawdown - a.max_drawdown);
  const falls = byDrawdown.map((s) => `${pct(-s.max_drawdown)} for ${s.name}`);
  sentences.push(
    `The worst peak-to-trough falls were ${falls.slice(0, -1).join(', ')} and ${falls[falls.length - 1]}.`
  );

  const sharpe = stats.filter((s) => s.sharpe_ratio != null);
  if (sharpe.length === stats.length) {
    const top = [...sharpe].sort((a, b) => (b.sharpe_ratio as number) - (a.sharpe_ratio as number))[0];
    sentences.push(
      `On a risk-adjusted basis, ${top.name} had the ${stats.length === 2 ? 'higher' : 'highest'} Sharpe ratio (${(top.sharpe_ratio as number).toFixed(2)}).`
    );
  }
  return sentences.join(' ');
}
