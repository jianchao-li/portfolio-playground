/**
 * Explanatory copy shared by the visible guide, the stats-table tooltips and
 * the structured data (JSON-LD must match what visitors can see).
 *
 * Keep it in step with the backend's methodology (backend/app/services/analyzer.py).
 */

/** Metric definitions, keyed by the stats table's column terms. */
export const METRIC_DEFINITIONS: Record<string, string> = {
  'Total Return': 'The overall gain or loss of an investment over the selected period, including capital appreciation and dividends, expressed as a percentage.',
  'Annualized Return': 'The geometric average yearly return. It shows what annual return would produce the same total return if compounded each year.',
  'Volatility': 'A measure of risk based on the standard deviation of returns. Higher volatility means larger price swings and greater uncertainty.',
  'Sharpe Ratio': 'Risk-adjusted return: (portfolio return − risk-free rate) ÷ volatility. Uses 3-month T-bill rate as risk-free rate. Falls back to 5% annual rate if T-bill data is unavailable. Higher is better.',
  'Sortino Ratio': 'Like the Sharpe ratio, but only downside moves count as risk: (portfolio return − risk-free rate) ÷ downside deviation, which uses only returns below the risk-free rate. Higher is better.',
  'Max Drawdown': 'The largest peak-to-trough decline during the period. It shows the worst-case loss an investor could have experienced.',
};

export const DISCLAIMER =
  'For informational and educational purposes only — not financial advice. The author is not a ' +
  'financial advisor, and use of this tool does not create an advisory relationship. Data may be ' +
  'inaccurate, delayed, or incomplete. The author assumes no liability for any losses or damages ' +
  'arising from reliance on information provided. Consult a qualified financial professional before ' +
  'making investment decisions.';

/** "How it works" paragraphs. */
export const METHODOLOGY: { heading: string; text: string }[] = [
  {
    heading: 'Price data',
    text: 'Daily prices come from Yahoo Finance. They are adjusted closes, so splits are accounted for and dividends are reinvested: the returns shown are total returns, before taxes and fund-level costs beyond those already in the price.',
  },
  {
    heading: 'Growth chart',
    text: 'Every portfolio starts at 100 on its first day with data, so lines can be compared directly regardless of share prices. When portfolios start on different dates (a fund launched later), they can be aligned to the latest common start date.',
  },
  {
    heading: 'Rebalancing',
    text: 'Without rebalancing (buy-and-hold), weights drift with prices. With monthly, quarterly or annual rebalancing, holdings are reset to their target weights at the close of the first trading day of each period, with no transaction costs or taxes.',
  },
  {
    heading: 'Statistics',
    text: 'Returns are annualized over calendar time (365.25 days a year), so stocks, which trade about 252 days a year, and crypto, which trades every day, are treated consistently. Sharpe and Sortino ratios use the average 13-week US Treasury bill yield over each portfolio’s own period as the risk-free rate, or 5% a year when that data is unavailable.',
  },
  {
    heading: 'Currencies',
    text: 'Results can be shown in 40 currencies using daily exchange rates, so you can see how a US fund would have performed for an investor in euros, pounds or yen, including currency gains and losses.',
  },
  {
    heading: 'Limitations',
    text: 'Backtests describe the past, not the future. They ignore taxes, trading costs and bid-ask spreads, and a fund’s history only goes back to its launch. Use them to understand risk and return trade-offs, not to predict results.',
  },
];

/** Frequently asked questions (also published as FAQPage structured data). */
export const FAQ: { question: string; answer: string }[] = [
  {
    question: 'Is Portfolio Playground free?',
    answer: 'Yes. It is free to use, needs no account, and is open source on GitHub.',
  },
  {
    question: 'Where does the data come from?',
    answer: 'Daily adjusted closing prices and exchange rates come from Yahoo Finance. The risk-free rate is the 13-week US Treasury bill yield.',
  },
  {
    question: 'Are dividends included in the returns?',
    answer: 'Yes. Prices are adjusted for dividends and splits, so returns assume dividends are reinvested.',
  },
  {
    question: 'How does rebalancing work?',
    answer: 'Choose monthly, quarterly or annual rebalancing to reset each portfolio to its target weights on the first trading day of each period. With no rebalancing, weights drift with prices (buy-and-hold).',
  },
  {
    question: 'Can I see results in euros, pounds or other currencies?',
    answer: 'Yes. Pick any of 40 currencies and all values and statistics are converted with daily exchange rates.',
  },
  {
    question: 'Why do some portfolios start later than others?',
    answer: 'A portfolio can only start once every fund in it has price data. When portfolios start on different dates, you can align them all to the latest common start so the comparison is fair.',
  },
  {
    question: 'Can I share or download a comparison?',
    answer: 'Yes. The Share button copies a link that reopens the same portfolios, dates, currency and rebalancing, and the CSV button downloads the daily values and statistics.',
  },
  {
    question: 'Is this financial advice?',
    answer: 'No. It is an educational tool. Past performance does not guarantee future results; consult a qualified financial professional before making investment decisions.',
  },
];
