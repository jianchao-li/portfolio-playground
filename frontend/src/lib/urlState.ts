/**
 * Shareable URL state: (de)serialize the playground's view to a query string.
 *
 * Schema v1 (all params optional except v; unknown params are ignored, so new
 * ones can be added later without bumping the version):
 *
 *   v=1                       schema version (required)
 *   p=@VOO                    a preset, by its single symbol (repeat p, in order)
 *   p=My Mix~VOO:60,BND:40    a custom portfolio: name ~ symbol:weight% list
 *                             (a name starting with @ or \ is written with a
 *                             leading \, so it can't be read as a preset)
 *   s=2023-01-01              start date (omitted when it is the default)
 *   e=2025-12-31              end date
 *   c=JPY                     currency (omitted when it is the default)
 *   a=1 / a=0                 align start dates on / off (omitted: automatic)
 *   r=monthly                 rebalancing: monthly / quarterly / annually
 *                             (omitted: none, i.e. buy-and-hold)
 *
 * Everything read from a URL is untrusted: it is validated and clamped, and
 * anything unusable falls back to the defaults instead of throwing.
 *
 * This module has no runtime imports, so it can be unit-tested with plain
 * Node (see scripts/url-state.test.mjs).
 */
import type { Asset } from './api';

export const URL_STATE_VERSION = '1';

// Backend limits: 20 portfolios, 50 assets in total, 25-year range
export const MAX_PORTFOLIOS = 20;
export const MAX_TOTAL_ASSETS = 50;
export const MAX_ASSETS_PER_PORTFOLIO = 20;
export const MAX_NAME_LENGTH = 40;
export const MAX_RANGE_DAYS = 25 * 365;
const MAX_PARAM_LENGTH = 500;

// Yahoo symbols: letters, digits and ^ = . - (e.g. ^GSPC, EURUSD=X, BRK-B, 7203.T)
const SYMBOL_RE = /^[A-Z0-9^=.-]{1,15}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface UrlPortfolio {
  name: string;
  assets: Asset[];
}

export interface UrlState {
  portfolios: UrlPortfolio[];
  startDate: string;
  endDate: string;
  currency: string;
  /** Align portfolios to their latest common start; undefined = automatic. */
  alignStart?: boolean;
  /** Rebalancing schedule; undefined = none (buy-and-hold). */
  rebalance?: UrlRebalance;
}

export type UrlRebalance = 'monthly' | 'quarterly' | 'annually';
const REBALANCE_VALUES: readonly string[] = ['monthly', 'quarterly', 'annually'];

export interface UrlStateConfig {
  presets: readonly UrlPortfolio[];
  currencies: ReadonlySet<string>;
  defaultStartDate: string;
  defaultCurrency: string;
  /** Today's date (YYYY-MM-DD); the latest allowed end date. */
  today: string;
}

/** A preset's URL key: its symbol when it holds exactly one asset. */
const presetKey = (p: UrlPortfolio) => (p.assets.length === 1 ? p.assets[0].symbol : null);

function isValidDate(s: string | null): s is string {
  if (!s || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Strip control characters and angle brackets, collapse spaces, cap length. */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

// Percent with up to 4 decimals, so weights round-trip to within 1e-6
/** Prefix names starting with @ (preset marker) or \ (escape) with a backslash. */
const escapeName = (name: string) => (/^[@\\]/.test(name) ? `\\${name}` : name);

const weightPercent = (w: number) => String(Math.round(w * 1_000_000) / 10_000);

/** Parse "VOO:60,BND:40" into normalized assets (weights sum to 1), or null. */
function parseAssets(raw: string): Asset[] | null {
  const merged = new Map<string, number>();
  for (const part of raw.split(',').slice(0, MAX_ASSETS_PER_PORTFOLIO * 2)) {
    const sep = part.lastIndexOf(':');
    if (sep <= 0) continue;
    const symbol = part.slice(0, sep).trim().toUpperCase();
    const weight = Number(part.slice(sep + 1));
    if (!SYMBOL_RE.test(symbol) || !Number.isFinite(weight) || weight <= 0) continue;
    if (!merged.has(symbol) && merged.size >= MAX_ASSETS_PER_PORTFOLIO) continue;
    merged.set(symbol, (merged.get(symbol) ?? 0) + Math.min(weight, 100));
  }
  const total = Array.from(merged.values()).reduce((a, b) => a + b, 0);
  if (merged.size === 0 || total <= 0) return null;
  const assets = Array.from(merged, ([symbol, w]) => ({ symbol, weight: w / total }));
  // Make the weights sum to exactly 1 (the backend allows 1e-9 of slack)
  const rest = assets.slice(1).reduce((a, x) => a + x.weight, 0);
  assets[0].weight = 1 - rest;
  return assets;
}

/** Make `name` unique among `taken`, and distinct from preset names. */
function uniqueName(name: string, taken: Set<string>, presetNames: Set<string>): string {
  let candidate = presetNames.has(name) ? `${name} (custom)`.slice(0, MAX_NAME_LENGTH) : name;
  for (let n = 2; taken.has(candidate) || presetNames.has(candidate); n++) {
    candidate = `${name.slice(0, MAX_NAME_LENGTH - 4)} (${n})`;
  }
  return candidate;
}

/**
 * Read state from a query string. Returns null when there is no (recognized)
 * state in the URL, so the caller keeps its defaults. Individual bad values
 * fall back to their defaults; bad portfolios are skipped.
 */
export function parseUrlState(search: string, config: UrlStateConfig): UrlState | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  if (params.get('v') !== URL_STATE_VERSION) return null;

  const presetsByKey = new Map<string, UrlPortfolio>();
  for (const p of config.presets) {
    const key = presetKey(p);
    if (key) presetsByKey.set(key, p);
  }
  const presetNames = new Set(config.presets.map((p) => p.name));

  const portfolios: UrlPortfolio[] = [];
  const names = new Set<string>();
  let totalAssets = 0;
  for (const raw of params.getAll('p')) {
    if (portfolios.length >= MAX_PORTFOLIOS) break;
    const value = raw.slice(0, MAX_PARAM_LENGTH);
    let portfolio: UrlPortfolio | null = null;
    if (value.startsWith('@')) {
      const preset = presetsByKey.get(value.slice(1).trim().toUpperCase());
      if (preset && !names.has(preset.name)) {
        portfolio = { name: preset.name, assets: preset.assets.map((a) => ({ ...a })) };
      }
    } else {
      const sep = value.lastIndexOf('~');
      const assets = sep >= 0 ? parseAssets(value.slice(sep + 1)) : null;
      const rawName = sep >= 0 ? value.slice(0, sep) : '';
      // A leading backslash escapes names that start with @ or \
      const name = sanitizeName(rawName.startsWith('\\') ? rawName.slice(1) : rawName);
      if (assets && name) portfolio = { name: uniqueName(name, names, presetNames), assets };
    }
    if (!portfolio || totalAssets + portfolio.assets.length > MAX_TOTAL_ASSETS) continue;
    totalAssets += portfolio.assets.length;
    names.add(portfolio.name);
    portfolios.push(portfolio);
  }

  // Dates: valid, end not in the future, start before end, within 25 years
  let endDate = params.get('e');
  if (!isValidDate(endDate) || endDate > config.today) endDate = config.today;
  let startDate = params.get('s');
  if (!isValidDate(startDate)) startDate = config.defaultStartDate;
  if (startDate >= endDate) {
    startDate = config.defaultStartDate < endDate ? config.defaultStartDate : addDays(endDate, -365);
  }
  if (daysBetween(startDate, endDate) > MAX_RANGE_DAYS) startDate = addDays(endDate, -MAX_RANGE_DAYS);

  const c = (params.get('c') ?? '').toUpperCase();
  const currency = config.currencies.has(c) ? c : config.defaultCurrency;

  const a = params.get('a');
  const alignStart = a === '1' ? true : a === '0' ? false : undefined;

  const r = (params.get('r') ?? '').toLowerCase();
  const rebalance = REBALANCE_VALUES.includes(r) ? r as UrlRebalance : undefined;

  return {
    portfolios, startDate, endDate, currency,
    ...(alignStart !== undefined && { alignStart }),
    ...(rebalance && { rebalance }),
  };
}

/** True when the state is exactly the page's default view (no URL needed). */
export function isDefaultState(
  state: UrlState, defaultPortfolios: readonly UrlPortfolio[], config: UrlStateConfig
): boolean {
  return state.startDate === config.defaultStartDate
    && state.endDate === config.today
    && state.currency === config.defaultCurrency
    && state.alignStart === undefined
    && state.rebalance === undefined
    && state.portfolios.length === defaultPortfolios.length
    && state.portfolios.every((p, i) => p.name === defaultPortfolios[i].name
      && sameAssets(p.assets, defaultPortfolios[i].assets));
}

const sameAssets = (a: Asset[], b: Asset[]) =>
  a.length === b.length && a.every((x, i) => x.symbol === b[i].symbol && Math.abs(x.weight - b[i].weight) < 1e-9);

/**
 * The align choice to put in the URL: only while it can matter, i.e. the shown
 * portfolios start on different dates. Otherwise a leftover a=1/a=0 (e.g.
 * after removing the late starter) would be noise in shared links.
 */
export function alignParam(alignMode: boolean | undefined, startsDiffer: boolean): boolean | undefined {
  return startsDiffer ? alignMode : undefined;
}

/**
 * Serialize state to a query string ("" for the default view). Presets are
 * written as @SYMBOL so preset-only links stay short.
 */
export function serializeUrlState(
  state: UrlState, defaultPortfolios: readonly UrlPortfolio[], config: UrlStateConfig
): string {
  if (isDefaultState(state, defaultPortfolios, config)) return '';
  const params = new URLSearchParams();
  params.set('v', URL_STATE_VERSION);
  for (const p of state.portfolios) {
    const preset = config.presets.find((x) => x.name === p.name && sameAssets(x.assets, p.assets));
    const key = preset && presetKey(preset);
    params.append('p', key
      ? `@${key}`
      : `${escapeName(sanitizeName(p.name))}~${p.assets.map((a) => `${a.symbol}:${weightPercent(a.weight)}`).join(',')}`);
  }
  if (state.startDate !== config.defaultStartDate) params.set('s', state.startDate);
  params.set('e', state.endDate);
  if (state.currency !== config.defaultCurrency) params.set('c', state.currency);
  if (state.alignStart !== undefined) params.set('a', state.alignStart ? '1' : '0');
  if (state.rebalance) params.set('r', state.rebalance);
  // Keep ~ : , @ readable in the address bar (all are safe in a query value)
  return `?${params.toString().replace(/%7E/gi, '~').replace(/%3A/gi, ':').replace(/%2C/gi, ',').replace(/%40/gi, '@')}`;
}
