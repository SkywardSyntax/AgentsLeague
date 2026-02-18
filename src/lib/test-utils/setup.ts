/**
 * Vitest global setup — runs before every test file.
 *
 * - Polyfills for jsdom (crypto, structuredClone, etc.)
 * - Global mock for requestAnimationFrame / cancelAnimationFrame
 * - Silence console noise in tests
 */

import { afterEach, vi } from 'vitest';

// ── Polyfill crypto.randomUUID if missing (jsdom) ───────────────────

if (typeof globalThis.crypto === 'undefined') {
  (globalThis as Record<string, unknown>).crypto = {
    randomUUID: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  };
} else if (typeof globalThis.crypto.randomUUID !== 'function') {
  (globalThis.crypto as unknown as Record<string, unknown>).randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

// ── Polyfill structuredClone if missing ─────────────────────────────

if (typeof globalThis.structuredClone !== 'function') {
  (globalThis as Record<string, unknown>).structuredClone = <T>(obj: T): T =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    JSON.parse(JSON.stringify(obj));
}

// ── Stub performance.now if missing ─────────────────────────────────

if (typeof globalThis.performance === 'undefined') {
  (globalThis as Record<string, unknown>).performance = {
    now: () => Date.now(),
  };
}

// ── Default rAF / cAF stubs (passthrough) ───────────────────────────

if (typeof globalThis.requestAnimationFrame !== 'function') {
  let nextId = 1;
  (globalThis as Record<string, unknown>).requestAnimationFrame = (
    cb: FrameRequestCallback,
  ) => {
    const id = nextId++;
    setTimeout(() => cb(performance.now()), 0);
    return id;
  };
}

if (typeof globalThis.cancelAnimationFrame !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  (globalThis as Record<string, unknown>).cancelAnimationFrame = () => {};
}

// ── Mock environment variables for tests ────────────────────────────

process.env.OPENAI_API_KEY = 'sk-test-fake-key-for-testing-only';
process.env.OPENAI_MODEL = 'claude-opus-4.6-fast';
process.env.OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';
process.env.OPENAI_REASONING_MODEL = 'o4-mini';

// ── Cleanup after each test ─────────────────────────────────────────

afterEach(() => {
  vi.restoreAllMocks();
});
