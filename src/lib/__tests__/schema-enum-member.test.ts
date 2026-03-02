import { describe, it, expect } from 'vitest';
import { isEnumMember } from '@/lib/schema';

const COLORS = ['red', 'green', 'blue'] as const;

describe('isEnumMember', () => {
  it('returns true for a valid member', () => {
    expect(isEnumMember(COLORS, 'red')).toBe(true);
    expect(isEnumMember(COLORS, 'green')).toBe(true);
    expect(isEnumMember(COLORS, 'blue')).toBe(true);
  });

  it('returns false for an invalid member', () => {
    expect(isEnumMember(COLORS, 'yellow')).toBe(false);
    expect(isEnumMember(COLORS, '')).toBe(false);
    expect(isEnumMember(COLORS, 'RED')).toBe(false);
  });

  it('returns false for an empty allowed list', () => {
    expect(isEnumMember([] as const, 'anything')).toBe(false);
  });

  it('narrows the type via type predicate', () => {
    const value: string = 'red';
    if (isEnumMember(COLORS, value)) {
      // TypeScript should narrow value to 'red' | 'green' | 'blue'
      const narrowed: (typeof COLORS)[number] = value;
      expect(narrowed).toBe('red');
    }
  });
});
