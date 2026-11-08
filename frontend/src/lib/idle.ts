/**
 * Run `callback` once the browser is idle, at least `delayMs` from now and at
 * most `timeoutMs` after that. Returns a function that cancels it.
 */
export function whenIdle(
  callback: () => void,
  { delayMs = 0, timeoutMs = 4000 }: { delayMs?: number; timeoutMs?: number } = {}
): () => void {
  let idleId: number | undefined;
  let fallbackId: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => callback(), { timeout: timeoutMs });
    } else {
      fallbackId = setTimeout(callback, Math.min(timeoutMs, 1000));
    }
  };
  const delayId = setTimeout(schedule, delayMs);
  return () => {
    clearTimeout(delayId);
    if (fallbackId !== undefined) clearTimeout(fallbackId);
    if (idleId !== undefined && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(idleId);
    }
  };
}

/** The visitor asked browsers to reduce data use (Save-Data / Data Saver). */
export function prefersSaveData(nav: unknown = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  const connection = (nav as { connection?: { saveData?: boolean } } | undefined)?.connection;
  return connection?.saveData === true;
}
