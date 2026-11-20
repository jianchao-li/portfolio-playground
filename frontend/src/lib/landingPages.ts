/**
 * Indexable landing pages: popular "X vs Y" comparisons and classic
 * allocations. Each opens the playground preloaded with its portfolios and
 * adds hand-written context, so every page answers a real search on its own.
 *
 * Adding a page: append an entry; routes, sitemap and internal links pick it up.
 * Slugs are permanent (they are public URLs). Keep one order per pair.
 */
import type { Rebalance } from './api';
import type { PortfolioInput } from './portfolios';

export type LandingKind = 'compare' | 'portfolios';

export interface LandingPage {
  kind: LandingKind;
  slug: string;
  /** Page H1. */
  heading: string;
  /** <title> (the site name is appended); keep under ~45 characters. */
  title: string;
  /** Meta description, ~150 characters. */
  description: string;
  /** Short label for link lists. */
  linkLabel: string;
  portfolios: PortfolioInput[];
  startDate: string;
  rebalance: Rebalance;
  /** Hand-written context paragraphs. */
  intro: string[];
  /** Slugs ("kind/slug") of related pages to link to. */
  related: string[];
}

const fund = (name: string, symbol: string): PortfolioInput => ({ name, assets: [{ symbol, weight: 1 }] });
const mix = (name: string, weights: Record<string, number>): PortfolioInput => ({
  name,
  assets: Object.entries(weights).map(([symbol, weight]) => ({ symbol, weight })),
});

// The playground's presets (./presets), by name, so links stay short (@VOO).
// Kept inline (no runtime imports, for plain-Node tests); a test checks they match.
const SP500 = fund('S&P 500', 'VOO');
const NASDAQ = fund('NASDAQ 100', 'QQQ');
const DEVELOPED = fund('Developed Markets ex-US', 'VEA');
const EMERGING = fund('Emerging Markets', 'VWO');
const GOLD = fund('Gold', 'GLD');
const BITCOIN = fund('Bitcoin', 'IBIT');

// IBIT, the first large US spot bitcoin ETF, began trading on 2024-01-11
const IBIT_START = '2024-01-11';

export const LANDING_PAGES: LandingPage[] = [
  {
    kind: 'compare',
    slug: 'voo-vs-qqq',
    heading: 'VOO vs QQQ: S&P 500 vs Nasdaq 100 historical returns',
    title: 'VOO vs QQQ Backtest: S&P 500 vs Nasdaq 100',
    description: 'Compare VOO and QQQ since 2011: growth of $100, annualized return, volatility, Sharpe ratio and max drawdown. Free, interactive backtest.',
    linkLabel: 'VOO vs QQQ',
    portfolios: [SP500, NASDAQ],
    startDate: '2011-01-01',
    rebalance: 'none',
    intro: [
      'VOO tracks the S&P 500, about 500 large US companies weighted by market value. QQQ tracks the Nasdaq 100, the 100 largest non-financial companies listed on the Nasdaq, so it leans much more heavily on technology and a handful of mega-caps.',
      'That concentration has paid off in the long tech bull market, but it also means deeper falls when growth stocks sell off, as in 2022. Compare the two on drawdowns and the Sharpe ratio, not just total return, and try different start dates to see how much the answer depends on the period.',
    ],
    related: ['compare/voo-vs-vti', 'compare/spy-vs-voo', 'compare/voo-vs-gld'],
  },
  {
    kind: 'compare',
    slug: 'voo-vs-vti',
    heading: 'VOO vs VTI: S&P 500 vs total US stock market',
    title: 'VOO vs VTI Backtest: S&P 500 vs Total Market',
    description: 'VOO vs VTI since 2011: see how the S&P 500 compares with the total US stock market on returns, volatility and drawdowns. Free interactive backtest.',
    linkLabel: 'VOO vs VTI',
    portfolios: [SP500, fund('Total US Stock Market', 'VTI')],
    startDate: '2011-01-01',
    rebalance: 'none',
    intro: [
      'VTI holds nearly every listed US stock, around 3,500 companies, while VOO holds only the roughly 500 in the S&P 500. Because both are weighted by market value, large companies make up about 80% of VTI anyway, so the two usually move almost in lockstep.',
      'The difference comes from small and mid-sized companies: VTI does a little better when they lead and a little worse when mega-caps dominate. The chart shows how small that gap has been in practice.',
    ],
    related: ['compare/spy-vs-voo', 'compare/voo-vs-qqq', 'portfolios/three-fund'],
  },
  {
    kind: 'compare',
    slug: 'spy-vs-voo',
    heading: 'SPY vs VOO: two S&P 500 ETFs compared',
    title: 'SPY vs VOO Backtest: S&P 500 ETFs Compared',
    description: 'SPY vs VOO since 2011: both track the S&P 500, so what differs? Compare total returns, volatility and drawdowns in a free interactive backtest.',
    linkLabel: 'SPY vs VOO',
    portfolios: [fund('SPDR S&P 500 (SPY)', 'SPY'), SP500],
    startDate: '2011-01-01',
    rebalance: 'none',
    intro: [
      'SPY and VOO both track the S&P 500, so their lines are almost identical. The small gap in total return comes mostly from costs: VOO’s expense ratio is lower, and SPY, structured as a unit investment trust, cannot reinvest dividends between payouts.',
      'SPY’s strengths are trading volume and options liquidity, which matter to traders more than long-term investors. Lengthen the date range to see how a small cost difference compounds.',
    ],
    related: ['compare/voo-vs-vti', 'compare/voo-vs-qqq', 'compare/voo-vs-vea'],
  },
  {
    kind: 'compare',
    slug: 'voo-vs-vea',
    heading: 'VOO vs VEA: US vs international developed-market stocks',
    title: 'VOO vs VEA Backtest: US vs International Stocks',
    description: 'Compare US stocks (VOO) with developed markets outside the US (VEA) since 2011: returns, volatility, Sharpe ratio and drawdowns, in 40 currencies.',
    linkLabel: 'VOO vs VEA',
    portfolios: [SP500, DEVELOPED],
    startDate: '2011-01-01',
    rebalance: 'none',
    intro: [
      'VEA holds large and mid-sized companies in developed markets outside the US, such as Japan, the UK, Europe, Canada and Australia. US stocks have outperformed them for most of the past decade, helped by a strong dollar and the rise of US technology giants.',
      'Leadership between the US and the rest of the world has historically rotated over long cycles. Switch the currency to see how the comparison looks for an investor who does not spend dollars.',
    ],
    related: ['compare/voo-vs-vwo', 'compare/vea-vs-vwo', 'portfolios/three-fund'],
  },
  {
    kind: 'compare',
    slug: 'voo-vs-vwo',
    heading: 'VOO vs VWO: US vs emerging-market stocks',
    title: 'VOO vs VWO Backtest: US vs Emerging Markets',
    description: 'S&P 500 (VOO) vs emerging markets (VWO) since 2011: growth, annualized return, volatility and max drawdown in a free interactive backtest.',
    linkLabel: 'VOO vs VWO',
    portfolios: [SP500, EMERGING],
    startDate: '2011-01-01',
    rebalance: 'none',
    intro: [
      'VWO invests in emerging markets such as China, India, Taiwan and Brazil: faster-growing economies, but with more political, currency and governance risk than the US.',
      'Faster economic growth has not translated into higher stock returns in recent years. The volatility and drawdown columns show the extra risk that came with emerging markets over this period.',
    ],
    related: ['compare/vea-vs-vwo', 'compare/voo-vs-vea', 'compare/voo-vs-gld'],
  },
  {
    kind: 'compare',
    slug: 'vea-vs-vwo',
    heading: 'VEA vs VWO: developed vs emerging markets outside the US',
    title: 'VEA vs VWO Backtest: Developed vs Emerging',
    description: 'Compare developed markets ex-US (VEA) with emerging markets (VWO) since 2008, including the financial crisis: returns, risk and drawdowns.',
    linkLabel: 'VEA vs VWO',
    portfolios: [DEVELOPED, EMERGING],
    startDate: '2008-01-01',
    rebalance: 'none',
    intro: [
      'For investors diversifying outside the US, the main choice is between developed markets (VEA: Japan, Europe, the UK, Canada, Australia) and emerging markets (VWO: China, India, Taiwan, Brazil and others).',
      'This comparison starts in 2008, so it includes the global financial crisis. Look at how deep each fell and how long each took to recover.',
    ],
    related: ['compare/voo-vs-vea', 'compare/voo-vs-vwo', 'portfolios/three-fund'],
  },
  {
    kind: 'compare',
    slug: 'voo-vs-gld',
    heading: 'Gold vs S&P 500: GLD vs VOO historical returns',
    title: 'Gold vs S&P 500 Backtest: GLD vs VOO',
    description: 'Gold (GLD) vs the S&P 500 (VOO) since 2011: compare growth, volatility, Sharpe ratio and max drawdowns, and see when gold held up better.',
    linkLabel: 'Gold vs S&P 500',
    portfolios: [SP500, GOLD],
    startDate: '2011-01-01',
    rebalance: 'none',
    intro: [
      'GLD holds physical gold bullion. Gold pays no dividends or earnings, so over long periods it has usually trailed stocks, but it often behaves differently, which is why many portfolios hold a small slice of it.',
      'This range starts near gold’s 2011 peak, which makes gold look weak. Try other start dates, and compare the drawdowns, to judge it as a diversifier rather than as a growth asset.',
    ],
    related: ['compare/gld-vs-ibit', 'compare/voo-vs-ibit', 'portfolios/all-weather'],
  },
  {
    kind: 'compare',
    slug: 'voo-vs-ibit',
    heading: 'Bitcoin vs S&P 500: IBIT vs VOO since the spot ETF launch',
    title: 'Bitcoin vs S&P 500 Backtest: IBIT vs VOO',
    description: 'Bitcoin (IBIT spot ETF) vs the S&P 500 (VOO) since January 2024: compare returns, volatility, Sharpe ratio and drawdowns in a free backtest.',
    linkLabel: 'Bitcoin vs S&P 500',
    portfolios: [SP500, BITCOIN],
    startDate: IBIT_START,
    rebalance: 'none',
    intro: [
      'IBIT is BlackRock’s spot bitcoin ETF, which began trading in January 2024 and holds bitcoin directly. It made bitcoin available in ordinary brokerage accounts, which is why this comparison starts at its launch.',
      'Bitcoin’s volatility is several times the stock market’s, so compare risk-adjusted numbers like the Sharpe and Sortino ratios, and the max drawdown, alongside total return. Try adding a mix, such as 95% VOO and 5% IBIT, with the Custom Portfolio button.',
    ],
    related: ['compare/gld-vs-ibit', 'compare/voo-vs-gld', 'compare/voo-vs-qqq'],
  },
  {
    kind: 'compare',
    slug: 'gld-vs-ibit',
    heading: 'Gold vs Bitcoin: GLD vs IBIT historical returns',
    title: 'Gold vs Bitcoin Backtest: GLD vs IBIT',
    description: 'Gold (GLD) vs bitcoin (IBIT) since the spot bitcoin ETF launch in 2024: compare returns, volatility and drawdowns of the two alternative assets.',
    linkLabel: 'Gold vs Bitcoin',
    portfolios: [GOLD, BITCOIN],
    startDate: IBIT_START,
    rebalance: 'none',
    intro: [
      'Gold and bitcoin are both pitched as stores of value outside the financial system, but they behave very differently. Gold has thousands of years of history and is relatively stable; bitcoin is young and swings far more.',
      'Both are available as ETFs: GLD holds gold bullion and IBIT holds bitcoin. Compare their volatility and drawdowns to see what each asks of an investor.',
    ],
    related: ['compare/voo-vs-ibit', 'compare/voo-vs-gld', 'portfolios/all-weather'],
  },
  {
    kind: 'portfolios',
    slug: '60-40',
    heading: '60/40 portfolio backtest: 60% stocks, 40% bonds',
    title: '60/40 Portfolio Backtest vs S&P 500',
    description: 'Backtest the classic 60/40 portfolio (60% VTI stocks, 40% BND bonds, rebalanced yearly) against the S&P 500: returns, volatility and drawdowns.',
    linkLabel: '60/40 portfolio',
    portfolios: [mix('60/40 Stocks/Bonds', { VTI: 0.6, BND: 0.4 }), SP500],
    startDate: '2011-01-01',
    rebalance: 'annually',
    intro: [
      'The 60/40 portfolio puts 60% in stocks and 40% in high-quality bonds and is rebalanced back to those weights, here once a year. It is the classic balanced portfolio: bonds cushion stock market falls and provide income, at the cost of some long-term growth.',
      'Here stocks are the total US market (VTI) and bonds the total US bond market (BND). 2022 was a rare year when stocks and bonds fell together; compare the max drawdown with the S&P 500 to see how much protection the bonds gave overall.',
    ],
    related: ['portfolios/three-fund', 'portfolios/all-weather', 'portfolios/golden-butterfly'],
  },
  {
    kind: 'portfolios',
    slug: 'three-fund',
    heading: 'Three-fund portfolio backtest: US stocks, international stocks and bonds',
    title: 'Three-Fund Portfolio Backtest (Bogleheads)',
    description: 'Backtest the Bogleheads three-fund portfolio (VTI, VXUS, BND), rebalanced yearly, against the S&P 500: growth, volatility, Sharpe and drawdowns.',
    linkLabel: 'Three-fund portfolio',
    portfolios: [mix('Three-Fund Portfolio', { VTI: 0.4, VXUS: 0.2, BND: 0.4 }), SP500],
    startDate: '2011-02-01',
    rebalance: 'annually',
    intro: [
      'The three-fund portfolio, popularized by the Bogleheads community after Vanguard founder John Bogle, owns the whole market with just three low-cost index funds: total US stocks (VTI), total international stocks (VXUS) and total US bonds (BND).',
      'This version holds 40% US stocks, 20% international stocks and 40% bonds, rebalanced yearly. Edit the weights to match your own stock/bond split, or change the currency to see it from outside the US.',
    ],
    related: ['portfolios/60-40', 'compare/voo-vs-vea', 'compare/voo-vs-vti'],
  },
  {
    kind: 'portfolios',
    slug: 'all-weather',
    heading: 'All Weather portfolio backtest: Ray Dalio’s risk-balanced mix',
    title: 'All Weather Portfolio Backtest (Ray Dalio)',
    description: 'Backtest an All Weather portfolio (stocks, long and mid-term Treasuries, gold, commodities), rebalanced yearly, against the S&P 500.',
    linkLabel: 'All Weather portfolio',
    portfolios: [
      mix('All Weather', { VTI: 0.3, TLT: 0.4, IEF: 0.15, GLD: 0.075, DBC: 0.075 }),
      SP500,
    ],
    startDate: '2011-01-01',
    rebalance: 'annually',
    intro: [
      'The All Weather portfolio is based on an allocation Ray Dalio described for individual investors: 30% stocks, 40% long-term Treasuries, 15% intermediate Treasuries, 7.5% gold and 7.5% commodities. It aims to balance risk across economic environments rather than to maximize return.',
      'Here it uses VTI, TLT, IEF, GLD and DBC, rebalanced yearly. Its heavy long-bond weight makes it sensitive to interest rates, which shows clearly in 2022.',
    ],
    related: ['portfolios/golden-butterfly', 'portfolios/60-40', 'compare/voo-vs-gld'],
  },
  {
    kind: 'portfolios',
    slug: 'golden-butterfly',
    heading: 'Golden Butterfly portfolio backtest',
    title: 'Golden Butterfly Portfolio Backtest',
    description: 'Backtest the Golden Butterfly portfolio (US stocks, small-cap value, long and short Treasuries, gold, 20% each) against the S&P 500.',
    linkLabel: 'Golden Butterfly portfolio',
    portfolios: [
      mix('Golden Butterfly', { VTI: 0.2, VBR: 0.2, TLT: 0.2, SHY: 0.2, GLD: 0.2 }),
      SP500,
    ],
    startDate: '2011-01-01',
    rebalance: 'annually',
    intro: [
      'The Golden Butterfly splits money equally five ways: total US stocks (VTI), US small-cap value (VBR), long-term Treasuries (TLT), short-term Treasuries (SHY) and gold (GLD). It is designed to hold up reasonably in booms, recessions, inflation and deflation alike.',
      'With 60% in bonds and gold it usually trails an all-stock portfolio in bull markets; compare the volatility and drawdown columns to see what that buys in calmer returns.',
    ],
    related: ['portfolios/all-weather', 'portfolios/60-40', 'compare/voo-vs-gld'],
  },
];

export const landingPath = (p: Pick<LandingPage, 'kind' | 'slug'>) => `/${p.kind}/${p.slug}`;

export const findLanding = (kind: LandingKind, slug: string) =>
  LANDING_PAGES.find((p) => p.kind === kind && p.slug === slug);

/** Related pages, resolved from their "kind/slug" keys. */
export const relatedLandings = (page: LandingPage) =>
  page.related
    .map((key) => LANDING_PAGES.find((p) => `${p.kind}/${p.slug}` === key))
    .filter((p): p is LandingPage => p !== undefined);

/** Static params for one kind of landing page (generateStaticParams). */
export const landingParams = (kind: LandingKind) =>
  LANDING_PAGES.filter((p) => p.kind === kind).map((p) => ({ slug: p.slug }));
