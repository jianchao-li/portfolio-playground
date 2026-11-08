/** Human-readable errors for API responses (pure; unit-tested in scripts/errors.test.mjs). */

/** Seconds from a Retry-After header (delta-seconds or HTTP date), or null. */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

/** Message for a 429: "Too many requests. Please wait …and try again." */
export function rateLimitMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds == null || retryAfterSeconds <= 1) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  const wait = retryAfterSeconds < 60
    ? `${retryAfterSeconds} seconds`
    : `about ${Math.ceil(retryAfterSeconds / 60)} minute${retryAfterSeconds > 60 ? 's' : ''}`;
  return `Too many requests. Please wait ${wait} and try again.`;
}
