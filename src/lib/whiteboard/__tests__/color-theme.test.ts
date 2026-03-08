import { describe, it, expect } from 'vitest';
import { getThemeColors, getCurveColor, COLOR_THEMES } from '../color-theme';
import type { ColorTheme, ThemeColors } from '../color-theme';

describe('getThemeColors', () => {
  it('returns all required keys for every theme', () => {
    const requiredKeys: (keyof ThemeColors)[] = [
      'axis', 'grid', 'curve1', 'curve2', 'curve3', 'fill', 'text', 'background',
    ];
    for (const theme of COLOR_THEMES) {
      const colors = getThemeColors(theme);
      for (const key of requiredKeys) {
        expect(colors[key], `${theme}.${key} should be defined`).toBeDefined();
        expect(typeof colors[key]).toBe('string');
        expect(colors[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('default theme uses dark gray axis color', () => {
    const colors = getThemeColors('default');
    expect(colors.axis).toBe('#1f2a44');
    expect(colors.background).toBe('#f7f9fc');
  });

  it('dark theme uses light axis and dark background', () => {
    const colors = getThemeColors('dark');
    expect(colors.axis).toBe('#e0e0e0');
    expect(colors.background).toBe('#1a1a2e');
  });

  it('colorful theme has vivid curve colors', () => {
    const colors = getThemeColors('colorful');
    expect(colors.curve1).toBe('#2979ff');
    expect(colors.curve2).toBe('#ff1744');
    expect(colors.curve3).toBe('#00c853');
  });

  it('pastel theme uses soft tones', () => {
    const colors = getThemeColors('pastel');
    expect(colors.curve1).toBe('#b39ddb');
    expect(colors.curve2).toBe('#f48fb1');
    expect(colors.curve3).toBe('#80cbc4');
  });

  it('monochrome theme uses only black/gray tones', () => {
    const colors = getThemeColors('monochrome');
    // All curve colors should be gray-scale (no color component)
    for (const key of ['axis', 'curve1', 'curve2', 'curve3', 'text'] as const) {
      const hex = colors[key].replace('#', '');
      // Each pair of hex digits should represent a gray value (r === g === b)
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      expect(r, `${key} R should equal G`).toBe(g);
      expect(g, `${key} G should equal B`).toBe(b);
    }
  });

  it('each theme has a unique background color', () => {
    const backgrounds = COLOR_THEMES.map((t) => getThemeColors(t).background);
    const unique = new Set(backgrounds);
    expect(unique.size).toBe(COLOR_THEMES.length);
  });

  it('getCurveColor cycles through curve1, curve2, curve3', () => {
    const theme: ColorTheme = 'colorful';
    const colors = getThemeColors(theme);
    expect(getCurveColor(theme, 0)).toBe(colors.curve1);
    expect(getCurveColor(theme, 1)).toBe(colors.curve2);
    expect(getCurveColor(theme, 2)).toBe(colors.curve3);
    // Cycles back
    expect(getCurveColor(theme, 3)).toBe(colors.curve1);
    expect(getCurveColor(theme, 4)).toBe(colors.curve2);
  });
});
