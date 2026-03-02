import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getInitialAppMode, getClientAppMode } from '../mode';

describe('getInitialAppMode', () => {
  const originalEnv = process.env.NEXT_PUBLIC_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_MODE;
    } else {
      process.env.NEXT_PUBLIC_MODE = originalEnv;
    }
  });

  it('returns "agent" when NEXT_PUBLIC_MODE is "agent"', () => {
    process.env.NEXT_PUBLIC_MODE = 'agent';
    expect(getInitialAppMode()).toBe('agent');
  });

  it('returns "interactive" when NEXT_PUBLIC_MODE is "interactive"', () => {
    process.env.NEXT_PUBLIC_MODE = 'interactive';
    expect(getInitialAppMode()).toBe('interactive');
  });

  it('returns "interactive" when NEXT_PUBLIC_MODE is unset', () => {
    delete process.env.NEXT_PUBLIC_MODE;
    expect(getInitialAppMode()).toBe('interactive');
  });

  it('returns "interactive" for arbitrary NEXT_PUBLIC_MODE value', () => {
    process.env.NEXT_PUBLIC_MODE = 'something_else';
    expect(getInitialAppMode()).toBe('interactive');
  });
});

describe('getClientAppMode', () => {
  const originalEnv = process.env.NEXT_PUBLIC_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_MODE;
    } else {
      process.env.NEXT_PUBLIC_MODE = originalEnv;
    }
  });

  it('returns "agent" when URL has ?mode=agent', () => {
    delete process.env.NEXT_PUBLIC_MODE;
    expect(getClientAppMode('?mode=agent')).toBe('agent');
  });

  it('returns "interactive" when URL has no mode param and env is unset', () => {
    delete process.env.NEXT_PUBLIC_MODE;
    expect(getClientAppMode('')).toBe('interactive');
  });

  it('falls through to env when URL mode is not "agent"', () => {
    process.env.NEXT_PUBLIC_MODE = 'agent';
    expect(getClientAppMode('?mode=interactive')).toBe('agent');
  });

  it('URL ?mode=agent overrides env "interactive"', () => {
    process.env.NEXT_PUBLIC_MODE = 'interactive';
    expect(getClientAppMode('?mode=agent')).toBe('agent');
  });

  it('returns "interactive" when search string has unrelated params', () => {
    delete process.env.NEXT_PUBLIC_MODE;
    expect(getClientAppMode('?foo=bar&baz=1')).toBe('interactive');
  });

  it('returns "interactive" for empty search with env unset', () => {
    delete process.env.NEXT_PUBLIC_MODE;
    expect(getClientAppMode('')).toBe('interactive');
  });
});
