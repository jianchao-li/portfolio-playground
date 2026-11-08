/**
 * Pure helpers for usePresetPrefetch (C5): after the page settles, one batched
 * /compare loads every preset that isn't shown, so clicking it is instant.
 *
 * The prefetch mirrors what addPreset does without it: /analyze, which never
 * aligns start dates. So the batch is requested with align_start=false (an
 * unaligned /compare result equals /analyze for each portfolio), and addPreset
 * keeps its existing "re-load aligned if starts now differ" step.
 */
import type { AnalysisResponse, Asset, Rebalance } from './api';

export interface PrefetchQuery {
  startDate: string;
  endDate: string;
  currency: string;
  align: boolean;
  rebalance: Rebalance;
}

export interface PrefetchPreset {
  name: string;
  assets: readonly Asset[];
}

/** Results are only valid for this exact query (align included, so toggling it invalidates). */
export function prefetchKey(q: PrefetchQuery): string {
  return `${q.startDate}|${q.endDate}|${q.currency}|${q.align ? 'aligned' : ''}|${q.rebalance}`;
}

/** Order-independent identity of a portfolio's holdings. */
export function assetsSignature(assets: readonly Asset[]): string {
  return assets.map((a) => `${a.symbol.trim().toUpperCase()}:${a.weight}`).sort().join(',');
}

/** Presets not already shown (by name, which also covers presets restored from a shared link). */
export function presetsToPrefetch<P extends PrefetchPreset>(presets: readonly P[], shownNames: readonly string[]): P[] {
  const shown = new Set(shownNames);
  return presets.filter((p) => !shown.has(p.name));
}

/** JSON body for the batched /compare (unaligned, like /analyze). */
export function prefetchBody(presets: readonly PrefetchPreset[], q: PrefetchQuery): string {
  return JSON.stringify({
    portfolios: presets.map((p) => ({ name: p.name, assets: p.assets })),
    start_date: q.startDate,
    end_date: q.endDate,
    currency: q.currency,
    align_start: false,
    rebalance: q.rebalance,
  });
}

export interface PrefetchEntry {
  signature: string;
  response: AnalysisResponse;
}

export interface PrefetchStore {
  key: string | null;
  entries: Map<string, PrefetchEntry>;
}

export const emptyStore = (): PrefetchStore => ({ key: null, entries: new Map() });

/** Store a batch for `key`; responses are in the same order as `presets`. */
export function storeBatch(
  key: string, presets: readonly PrefetchPreset[], responses: readonly AnalysisResponse[]
): PrefetchStore {
  const entries = new Map<string, PrefetchEntry>();
  presets.forEach((p, i) => {
    if (responses[i]) entries.set(p.name, { signature: assetsSignature(p.assets), response: responses[i] });
  });
  return { key, entries };
}

/** The prefetched response for `preset` under `key`, or null (stale key, unknown or changed preset). */
export function lookup(store: PrefetchStore, key: string, preset: PrefetchPreset): AnalysisResponse | null {
  if (store.key !== key) return null;
  const entry = store.entries.get(preset.name);
  return entry && entry.signature === assetsSignature(preset.assets) ? entry.response : null;
}

/** How long to stay quiet after a 429 (the backend allows 10 /prefetch per minute). */
export const RATE_LIMIT_BACKOFF_MS = 60_000;

/** Next allowed time after a response with `status` (only 429 backs off). */
export function backoffAfter(status: number, now: number, current = 0): number {
  return status === 429 ? Math.max(current, now + RATE_LIMIT_BACKOFF_MS) : current;
}

export function canPrefetch(
  { saveData, hidden, now, backoffUntil }: { saveData: boolean; hidden: boolean; now: number; backoffUntil: number }
): boolean {
  return !saveData && !hidden && now >= backoffUntil;
}
