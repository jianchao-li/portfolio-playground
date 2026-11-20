import type { Asset } from './api';

// Preset portfolios for quick comparison
export const PRESET_PORTFOLIOS: { name: string; assets: Asset[]; default?: boolean }[] = [
  {
    name: 'S&P 500',
    assets: [{ symbol: 'VOO', weight: 1.0 }],
    default: true,
  },
  {
    name: 'NASDAQ 100',
    assets: [{ symbol: 'QQQ', weight: 1.0 }],
  },
  {
    name: 'Developed Markets ex-US',
    assets: [{ symbol: 'VEA', weight: 1.0 }],
    default: true,
  },
  {
    name: 'Emerging Markets',
    assets: [{ symbol: 'VWO', weight: 1.0 }],
    default: true,
  },
  {
    name: 'Gold',
    assets: [{ symbol: 'GLD', weight: 1.0 }],
  },
  {
    name: 'Bitcoin',
    assets: [{ symbol: 'IBIT', weight: 1.0 }],
  },
  {
    name: 'Volatility',
    assets: [{ symbol: 'VIXY', weight: 1.0 }],
  },
];
