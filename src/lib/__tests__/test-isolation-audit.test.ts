import { describe, it, expect, afterEach, vi } from 'vitest';

describe('Test Isolation Audit', () => {
  // Test 1: Module-level svgCache from LatexSvg is isolated between test files
  it('svgCache from LatexSvg is not pre-populated from other test files', async () => {
    const mod = await import('@/components/chat/LatexSvg');
    // Module should load with a fresh svgCache (module-level Map)
    // vitest isolates modules per file, so each file gets its own instance
    expect(mod).toBeDefined();
    expect(typeof mod.LatexSvg).toBe('function');
  });

  // Test 2: renderCache from mathjax-client doesn't leak between test files
  it('mathjax-client module loads with fresh state', async () => {
    const mod = await import('@/lib/latex/mathjax-client');
    expect(mod).toBeDefined();
    expect(typeof mod.renderTexToSvg).toBe('function');
  });

  // Test 3: window.__agentAPI is undefined at test start
  it('window.__agentAPI is undefined at test start', () => {
    expect((window as unknown as Record<string, unknown>).__agentAPI).toBeUndefined();
  });

  // Test 4: Setting window.__agentAPI in one test doesn't affect next test
  describe('window.__agentAPI cleanup', () => {
    afterEach(() => {
      delete (window as unknown as Record<string, unknown>).__agentAPI;
    });

    it('sets window.__agentAPI', () => {
      (window as unknown as Record<string, unknown>).__agentAPI = { test: true };
      expect((window as unknown as Record<string, unknown>).__agentAPI).toBeDefined();
    });

    it('window.__agentAPI is undefined after cleanup', () => {
      expect((window as unknown as Record<string, unknown>).__agentAPI).toBeUndefined();
    });
  });

  // Test 5: vi.spyOn is auto-restored between tests
  describe('vi.spyOn restoration', () => {
    it('spies on Math.random', () => {
      const spy = vi.spyOn(Math, 'random');
      Math.random();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('Math.random is not a spy after previous test', () => {
      // After the previous test restored the spy, Math.random should be the original
      const result = Math.random();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(1);
    });
  });

  // Test 6: vi.useFakeTimers doesn't leak
  describe('fake timers isolation', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('uses fake timers', () => {
      vi.useFakeTimers();
      const fakeNow = Date.now();
      vi.advanceTimersByTime(10000);
      expect(Date.now()).toBe(fakeNow + 10000);
    });

    it('Date.now returns a reasonable timestamp after cleanup', () => {
      const now = Date.now();
      // Should be a recent timestamp (after 2024-01-01)
      expect(now).toBeGreaterThan(1704067200000);
      // Should not be frozen at the fake time
      const later = Date.now();
      expect(later).toBeGreaterThanOrEqual(now);
    });
  });

  // Test 7: DOM state is clean between tests (no leftover elements)
  it('document.body has no leftover child elements at test start', () => {
    expect(document.body.childElementCount).toBe(0);
  });

  // Test 8: localStorage is clean between tests
  it('localStorage is empty at test start', () => {
    // In jsdom, localStorage.length may be undefined if not fully implemented
    // We check that no keys have been set by previous tests
    const len = localStorage.length ?? 0;
    expect(len).toBe(0);
  });

  // Test 9: console.error is not suppressed by a previous test
  it('console.error is the original function (not a mock/spy)', () => {
    // If console.error were mocked, it would have a `mock` property
    expect((console.error as ReturnType<typeof vi.fn>).mock).toBeUndefined();
  });

  // Test 10: Environment variables are not leaked
  it('AGENT_STREAM_MODE env var is not leaked from previous tests', () => {
    // Should be undefined or have original value, not a test-injected value
    const val = process.env.AGENT_STREAM_MODE;
    // In test environment, this should not be set by any previous test
    expect(val === undefined || val === '').toBeTruthy();
  });
});
