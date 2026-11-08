'use client';

import { useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { prefersSaveData, whenIdle } from '@/lib/idle';
import { healthUrl, readWokenFlag, shouldWake, writeWokenFlag } from '@/lib/wakeBackend';

// A cold Render instance takes ~45 s to answer; don't hold the request longer
const WAKE_TIMEOUT_MS = 90_000;

/**
 * Once per browser session, after hydration and once the page is idle, send
 * a background GET /health so a sleeping backend starts waking up before the
 * visitor's first interaction needs it.
 *
 * Silent: no state, errors ignored. `no-cors` keeps it a simple request (no
 * preflight, no console noise if CORS doesn't allow this origin). Skipped when
 * the visitor asked to save data. /health has no rate limit on the backend.
 */
export function useWakeBackend({ enabled = true, apiBase = API_BASE }: { enabled?: boolean; apiBase?: string } = {}) {
  useEffect(() => {
    if (!enabled) return;
    const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined;
    if (!shouldWake({ saveData: prefersSaveData(), alreadyWoken: readWokenFlag(storage) })) return;

    return whenIdle(() => {
      writeWokenFlag(storage);
      fetch(healthUrl(apiBase), {
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
      }).catch(() => {});
    });
  }, [enabled, apiBase]);
}
