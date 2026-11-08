/**
 * Pure helpers for useWakeBackend (N-Perf-2): one background GET /health per
 * browser session, so a sleeping Render instance starts waking up before the
 * visitor's first interaction needs it.
 */

/** sessionStorage key marking that this session already pinged the backend. */
export const WAKE_SESSION_KEY = 'pp-backend-wake';

/** /health on the API origin (trailing slashes on the base are ignored). */
export function healthUrl(apiBase: string): string {
  return `${apiBase.replace(/\/+$/, '')}/health`;
}

/** Ping only once per session, and never when the visitor asked to save data. */
export function shouldWake({ saveData, alreadyWoken }: { saveData: boolean; alreadyWoken: boolean }): boolean {
  return !saveData && !alreadyWoken;
}

/** Read the session flag; storage can be unavailable (privacy modes): treat as not set. */
export function readWokenFlag(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(WAKE_SESSION_KEY) != null;
  } catch {
    return false;
  }
}

export function writeWokenFlag(storage: Pick<Storage, 'setItem'> | undefined, now = Date.now()): void {
  try {
    storage?.setItem(WAKE_SESSION_KEY, String(now));
  } catch {
    // ignore: at worst a later page load pings again
  }
}
