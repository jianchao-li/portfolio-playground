// Unit tests for src/lib/wakeBackend.ts and prefersSaveData (N-Perf-2 backend wake-up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthUrl, shouldWake, readWokenFlag, writeWokenFlag, WAKE_SESSION_KEY } from '../src/lib/wakeBackend.ts';
import { prefersSaveData } from '../src/lib/idle.ts';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('health URL on the API origin', () => {
  assert.equal(healthUrl('https://api.example.com'), 'https://api.example.com/health');
  assert.equal(healthUrl('http://localhost:8000/'), 'http://localhost:8000/health');
});

test('once per session, never with Save-Data', () => {
  assert.equal(shouldWake({ saveData: false, alreadyWoken: false }), true);
  assert.equal(shouldWake({ saveData: false, alreadyWoken: true }), false);
  assert.equal(shouldWake({ saveData: true, alreadyWoken: false }), false);
});

test('session flag round-trips and tolerates broken storage', () => {
  const s = memoryStorage();
  assert.equal(readWokenFlag(s), false);
  writeWokenFlag(s, 123);
  assert.equal(readWokenFlag(s), true);
  assert.equal(s.getItem(WAKE_SESSION_KEY), '123');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readWokenFlag(broken), false);
  assert.doesNotThrow(() => writeWokenFlag(broken));
  assert.equal(readWokenFlag(undefined), false);
});

test('Save-Data detection', () => {
  assert.equal(prefersSaveData({ connection: { saveData: true } }), true);
  assert.equal(prefersSaveData({ connection: { saveData: false } }), false);
  assert.equal(prefersSaveData({}), false);
  assert.equal(prefersSaveData(undefined), false);
});
