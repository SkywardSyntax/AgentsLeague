import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getInitialAppMode, getClientAppMode } from '../mode';

describe('mode.ts — getInitialAppMode & getClientAppMode', () => {
  let originalMode: string | undefined;

  beforeEach(() => {
    originalMode = process.env.NEXT_PUBLIC_MODE;
  });

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.NEXT_PUBLIC_MODE;
    } else {
      process.env.NEXT_PUBLIC_MODE = originalMode;
    }
  });

  describe('getInitialAppMode', () => {
    it('returns "agent" when NEXT_PUBLIC_MODE=agent', () => {
      process.env.NEXT_PUBLIC_MODE = 'agent';
      expect(getInitialAppMode()).toBe('agent');
    });

    it('returns "interactive" when NEXT_PUBLIC_MODE is unset', () => {
      delete process.env.NEXT_PUBLIC_MODE;
      expect(getInitialAppMode()).toBe('interactive');
    });

    it('returns "interactive" for any non-"agent" value', () => {
      for (const val of ['interactive', 'unknown', '', 'Agent']) {
        process.env.NEXT_PUBLIC_MODE = val;
        expect(getInitialAppMode()).toBe('interactive');
      }
    });

    it('is idempotent — multiple calls return same result', () => {
      process.env.NEXT_PUBLIC_MODE = 'agent';
      const r1 = getInitialAppMode();
      const r2 = getInitialAppMode();
      const r3 = getInitialAppMode();
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });
  });

  describe('getClientAppMode', () => {
    it('returns "agent" when URL has ?mode=agent', () => {
      expect(getClientAppMode('?mode=agent')).toBe('agent');
    });

    it('returns "agent" when URL has ?mode=agent even if env is unset', () => {
      delete process.env.NEXT_PUBLIC_MODE;
      expect(getClientAppMode('?mode=agent')).toBe('agent');
    });

    it('falls through to getInitialAppMode for non-agent URL mode', () => {
      process.env.NEXT_PUBLIC_MODE = 'agent';
      // URL says interactive, but only ?mode=agent overrides — env wins
      expect(getClientAppMode('?mode=interactive')).toBe('agent');
    });

    it('handles empty search string', () => {
      delete process.env.NEXT_PUBLIC_MODE;
      expect(getClientAppMode('')).toBe('interactive');
    });

    it('handles search string with other params but no mode', () => {
      delete process.env.NEXT_PUBLIC_MODE;
      expect(getClientAppMode('?foo=bar&baz=1')).toBe('interactive');
    });

    it('returns "agent" with full URL query string containing mode=agent', () => {
      expect(getClientAppMode('?mode=agent&debug=true')).toBe('agent');
    });
  });
});
