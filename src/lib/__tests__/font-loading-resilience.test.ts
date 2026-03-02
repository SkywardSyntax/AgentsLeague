import { describe, it, expect, vi } from 'vitest';
import {
  FONT_STACK,
  buildFontFamily,
  isFontAvailable,
  getFirstAvailableFont,
  estimateCharWidth,
} from '../font-fallback';

describe('Font Loading Resilience', () => {
  it('buildFontFamily joins array into CSS font-family string', () => {
    expect(buildFontFamily(['"SF Pro"', 'sans-serif'])).toBe('"SF Pro", sans-serif');
  });

  it('buildFontFamily handles single-element stack', () => {
    expect(buildFontFamily(['monospace'])).toBe('monospace');
  });

  it('isFontAvailable returns false for fictional font', () => {
    expect(isFontAvailable('NonExistentFont12345')).toBe(false);
  });

  it('isFontAvailable returns boolean for generic monospace', () => {
    // In jsdom, canvas measureText returns identical widths for all fonts,
    // so the result depends on the environment. Just verify it returns a boolean and doesn't crash.
    const result = isFontAvailable('monospace');
    expect(typeof result).toBe('boolean');
  });

  it('isFontAvailable returns false in SSR (no document)', () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error - simulating SSR
    delete globalThis.document;
    try {
      expect(isFontAvailable('Arial')).toBe(false);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('getFirstAvailableFont returns first available from stack', () => {
    expect(getFirstAvailableFont(['"NonExistent"', 'sans-serif'])).toBe('sans-serif');
  });

  it('getFirstAvailableFont returns generic fallback from real stack', () => {
    const result = getFirstAvailableFont(FONT_STACK.body);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('estimateCharWidth returns positive value for positive fontSize', () => {
    expect(estimateCharWidth(18)).toBeCloseTo(9.9);
    expect(estimateCharWidth(0)).toBe(0);
    expect(estimateCharWidth(-5)).toBeLessThan(0);
  });

  it('FONT_STACK.display includes Windows font', () => {
    const hasSegoeUI = FONT_STACK.display.some((f) => f.includes('Segoe UI'));
    expect(hasSegoeUI).toBe(true);
  });

  it('FONT_STACK stacks all end with generic family', () => {
    expect(FONT_STACK.display[FONT_STACK.display.length - 1]).toBe('sans-serif');
    expect(FONT_STACK.body[FONT_STACK.body.length - 1]).toBe('sans-serif');
    expect(FONT_STACK.mono[FONT_STACK.mono.length - 1]).toBe('monospace');
  });
});
