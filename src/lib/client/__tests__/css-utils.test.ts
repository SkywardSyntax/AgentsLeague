import { describe, it, expect } from 'vitest';
import { cx, spacing, colorClass, responsiveClass } from '../css-utils';

describe('Lane 08 — CSS Utility Classes', () => {
  it('cx() joins multiple class strings', () => {
    expect(cx('flex', 'gap-4', 'p-2')).toBe('flex gap-4 p-2');
  });

  it('cx() filters out falsy values', () => {
    expect(cx('flex', false, null, undefined, '', 'p-2')).toBe('flex p-2');
  });

  it('cx() handles conditional objects', () => {
    expect(cx({ active: true, disabled: false, 'text-red': true })).toBe('active text-red');
  });

  it('spacing() generates valid spacing classes', () => {
    expect(spacing('p', 4)).toBe('p-4');
    expect(spacing('mx', 2)).toBe('mx-2');
  });

  it('spacing() clamps to valid Tailwind scale', () => {
    // 13 is not a Tailwind value; should snap to nearest (12 or 14)
    const result = spacing('m', 13);
    expect(result === 'm-12' || result === 'm-14').toBe(true);
  });

  it('colorClass() generates valid color classes', () => {
    expect(colorClass('text', 'blue-500')).toBe('text-blue-500');
    expect(colorClass('bg', 'red-200')).toBe('bg-red-200');
  });

  it('colorClass() supports opacity modifier', () => {
    expect(colorClass('bg', 'blue-500', 50)).toBe('bg-blue-500/50');
  });

  it('responsiveClass() adds breakpoint prefixes', () => {
    expect(responsiveClass('md', 'hidden')).toBe('md:hidden');
    expect(responsiveClass('lg', 'flex')).toBe('lg:flex');
  });

  it('cx() deduplicates identical classes', () => {
    expect(cx('flex', 'flex', 'p-2')).toBe('flex p-2');
  });

  it('cx() returns empty string for no inputs', () => {
    expect(cx()).toBe('');
    expect(cx(false, null, undefined)).toBe('');
  });
});
