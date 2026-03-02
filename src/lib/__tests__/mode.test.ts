import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getInitialAppMode, getClientAppMode } from '../mode';

describe('getInitialAppMode', () => {
  const originalEnv = process.env.NEXT_PUBLIC_MODE;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_MODE = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_MODE;
    }
  });

  it('returns "agent" when NEXT_PUBLIC_MODE=agent', () => {
    process.env.NEXT_PUBLIC_MODE = 'agent';
    expect(getInitialAppMode()).toBe('agent');
  });

  it('returns "interactive" when env is unset', () => {
    delete process.env.NEXT_PUBLIC_MODE;
    expect(getInitialAppMode()).toBe('interactive');
  });

  it('returns "interactive" when env is empty string', () => {
    process.env.NEXT_PUBLIC_MODE = '';
    expect(getInitialAppMode()).toBe('interactive');
  });

  it('returns "interactive" when env is "interactive"', () => {
    process.env.NEXT_PUBLIC_MODE = 'interactive';
    expect(getInitialAppMode()).toBe('interactive');
  });

  it('returns "interactive" for unrecognized env value', () => {
    process.env.NEXT_PUBLIC_MODE = 'invalid';
    expect(getInitialAppMode()).toBe('interactive');
  });
});

describe('getClientAppMode', () => {
  const originalEnv = process.env.NEXT_PUBLIC_MODE;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_MODE = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_MODE;
    }
  });

  it('returns "interactive" for ?mode=interactive', () => {
    expect(getClientAppMode('?mode=interactive')).toBe('interactive');
  });

  it('returns "agent" for ?mode=agent', () => {
    expect(getClientAppMode('?mode=agent')).toBe('agent');
  });

  it('falls back to env when no URL param', () => {
    process.env.NEXT_PUBLIC_MODE = 'agent';
    expect(getClientAppMode('')).toBe('agent');
  });

  it('falls back to env when search has no mode param', () => {
    process.env.NEXT_PUBLIC_MODE = 'agent';
    expect(getClientAppMode('?foo=bar')).toBe('agent');
  });

  it('ignores invalid mode values and falls back', () => {
    delete process.env.NEXT_PUBLIC_MODE;
    expect(getClientAppMode('?mode=invalid')).toBe('interactive');
  });

  it('URL param overrides env', () => {
    process.env.NEXT_PUBLIC_MODE = 'agent';
    expect(getClientAppMode('?mode=interactive')).toBe('interactive');
  });
});
