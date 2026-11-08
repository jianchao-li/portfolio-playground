// Unit tests for src/lib/errors.ts (429 messages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRetryAfter, rateLimitMessage } from '../src/lib/errors.ts';

test('Retry-After as seconds or an HTTP date', () => {
  assert.equal(parseRetryAfter('42'), 42);
  assert.equal(parseRetryAfter(' 7 '), 7);
  const now = Date.parse('2026-11-08T12:00:00Z');
  assert.equal(parseRetryAfter('Sun, 08 Nov 2026 12:00:30 GMT', now), 30);
  assert.equal(parseRetryAfter('Sun, 08 Nov 2026 11:00:00 GMT', now), 0);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter('soon'), null);
});

test('human-readable 429 message', () => {
  assert.equal(rateLimitMessage(null), 'Too many requests. Please wait a moment and try again.');
  assert.equal(rateLimitMessage(1), 'Too many requests. Please wait a moment and try again.');
  assert.equal(rateLimitMessage(42), 'Too many requests. Please wait 42 seconds and try again.');
  assert.equal(rateLimitMessage(60), 'Too many requests. Please wait about 1 minute and try again.');
  assert.equal(rateLimitMessage(90), 'Too many requests. Please wait about 2 minutes and try again.');
});
