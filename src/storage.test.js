import test from 'node:test';
import assert from 'node:assert/strict';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from './storage.js';

function withStorage(value, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value });
  try { return run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

test('safe storage reads, writes and removes values', () => {
  const values = new Map();
  const fakeStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  withStorage(fakeStorage, () => {
    assert.equal(safeStorageGet('missing', 'fallback'), 'fallback');
    assert.equal(safeStorageSet('theme', 'blue'), true);
    assert.equal(safeStorageGet('theme'), 'blue');
    assert.equal(safeStorageRemove('theme'), true);
    assert.equal(safeStorageGet('theme'), null);
  });
});

test('safe storage falls back when WebView storage throws', () => {
  const brokenStorage = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('quota exceeded'); },
    removeItem() { throw new Error('storage unavailable'); },
  };
  withStorage(brokenStorage, () => {
    assert.equal(safeStorageGet('language', 'pt-BR'), 'pt-BR');
    assert.equal(safeStorageSet('language', 'en'), false);
    assert.equal(safeStorageRemove('language'), false);
  });
});

test('safe storage tolerates storage being absent', () => {
  withStorage(null, () => {
    assert.equal(safeStorageGet('theme', 'orange'), 'orange');
    assert.equal(safeStorageSet('theme', 'blue'), false);
    assert.equal(safeStorageRemove('theme'), false);
  });
});
