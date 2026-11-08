'use client';

import { useCallback, useEffect, useRef } from 'react';
import { API_BASE, AnalysisResponse, ComparisonResponse } from '@/lib/api';
import { prefersSaveData, whenIdle } from '@/lib/idle';
import {
  PrefetchPreset, PrefetchQuery, backoffAfter, canPrefetch, emptyStore, lookup,
  prefetchBody, prefetchKey, presetsToPrefetch, storeBatch,
} from '@/lib/presetPrefetch';

// Let the page's own requests go first, and skip keys the user is clicking through
const SETTLE_DELAY_MS = 1500;

export interface PresetPrefetchOptions {
  /** All presets offered as chips. */
  presets: readonly PrefetchPreset[];
  /** Names of portfolios currently shown (these are not prefetched). */
  shownNames: readonly string[];
  /** The current query; results are only used for this exact query. */
  query: PrefetchQuery;
  /** False while the page is loading or refreshing (and before a shared link has loaded). */
  enabled: boolean;
}

export interface PresetPrefetch {
  /**
   * The prefetched /analyze-equivalent response for `preset` under `query`,
   * or null (not prefetched, still loading, or the query changed since).
   */
  get: (preset: PrefetchPreset, query: PrefetchQuery) => AnalysisResponse | null;
}

/**
 * After the page settles and the browser is idle, load every preset that
 * isn't shown with ONE batched /prefetch (= /compare, unaligned like /analyze), so a
 * preset click can skip the network.
 *
 * - Results are dropped when the query (dates, currency, align, rebalance) changes.
 * - Skipped when the visitor asked to save data or the tab is hidden.
 * - Silent: errors are ignored; a 429 pauses prefetching for a minute.
 * - Uses the backend's /prefetch endpoint (same as /compare), which has its
 *   own rate-limit budget, so prefetching never uses up the visitor's
 *   /compare budget.
 */
export function usePresetPrefetch({ presets, shownNames, query, enabled }: PresetPrefetchOptions): PresetPrefetch {
  const storeRef = useRef(emptyStore());
  const backoffUntilRef = useRef(0);
  const key = prefetchKey(query);
  const missing = presetsToPrefetch(presets, shownNames);
  // Stable dependency for the set of presets to load
  const missingKey = missing.map((p) => p.name).join('\n');

  // A new query invalidates everything prefetched for the old one
  if (storeRef.current.key !== null && storeRef.current.key !== key) {
    storeRef.current = emptyStore();
  }

  const queryRef = useRef(query);
  queryRef.current = query;
  const missingRef = useRef(missing);
  missingRef.current = missing;

  useEffect(() => {
    if (!enabled || !missingKey) return;
    // Already prefetched these presets for this query
    const store = storeRef.current;
    if (store.key === key && missingRef.current.every((p) => store.entries.has(p.name))) return;

    const controller = new AbortController();
    const cancelIdle = whenIdle(async () => {
      const now = Date.now();
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (!canPrefetch({ saveData: prefersSaveData(), hidden, now, backoffUntil: backoffUntilRef.current })) return;
      const batch = missingRef.current;
      const q = queryRef.current;
      try {
        const response = await fetch(`${API_BASE}/api/portfolio/prefetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: prefetchBody(batch, q),
          signal: controller.signal,
        });
        backoffUntilRef.current = backoffAfter(response.status, Date.now(), backoffUntilRef.current);
        if (!response.ok) return;
        const body = (await response.json()) as ComparisonResponse;
        if (prefetchKey(queryRef.current) !== prefetchKey(q)) return; // query changed meanwhile
        storeRef.current = storeBatch(prefetchKey(q), batch, body.portfolios);
      } catch {
        // silent: aborted, offline, backend asleep...
      }
    }, { delayMs: SETTLE_DELAY_MS });

    return () => {
      cancelIdle();
      controller.abort();
    };
  }, [enabled, key, missingKey]);

  const get = useCallback(
    (preset: PrefetchPreset, q: PrefetchQuery) => lookup(storeRef.current, prefetchKey(q), preset),
    []
  );
  return { get };
}
