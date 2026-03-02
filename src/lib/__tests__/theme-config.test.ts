import { describe, it, expect } from 'vitest';
import { validateThemeConfig } from '@/lib/theme-config';

describe('ThemeConfigSchema', () => {
  it('accepts a fully valid configuration', () => {
    const config = validateThemeConfig({
      primaryColor: '#ff5500', secondaryColor: '#00aaff',
      backgroundColor: '#fafafa', textColor: '#333333',
      errorColor: '#cc0000', fontSize: 14, borderRadius: 4,
      spacingUnit: 8, darkMode: true,
    });
    expect(config.primaryColor).toBe('#ff5500');
    expect(config.darkMode).toBe(true);
  });

  it('applies defaults when fields are omitted', () => {
    const config = validateThemeConfig({});
    expect(config.primaryColor).toBe('#3b82f6');
    expect(config.fontSize).toBe(16);
    expect(config.borderRadius).toBe(8);
    expect(config.darkMode).toBe(false);
  });

  it('rejects invalid hex color format', () => {
    expect(() => validateThemeConfig({ primaryColor: 'red' })).toThrow();
    expect(() => validateThemeConfig({ primaryColor: 'rgb(255,0,0)' })).toThrow();
  });

  it('rejects short hex color format', () => {
    expect(() => validateThemeConfig({ primaryColor: '#fff' })).toThrow();
  });

  it('rejects named colors', () => {
    expect(() => validateThemeConfig({ backgroundColor: 'white' })).toThrow();
    expect(() => validateThemeConfig({ textColor: 'black' })).toThrow();
  });

  it('rejects negative font size', () => {
    expect(() => validateThemeConfig({ fontSize: -1 })).toThrow();
    expect(() => validateThemeConfig({ fontSize: 0 })).toThrow();
  });

  it('rejects negative border radius', () => {
    expect(() => validateThemeConfig({ borderRadius: -1 })).toThrow();
  });

  it('rejects spacing unit out of bounds', () => {
    expect(() => validateThemeConfig({ spacingUnit: 0 })).toThrow();
    expect(() => validateThemeConfig({ spacingUnit: 65 })).toThrow();
  });

  it('validates all color fields enforce hex format', () => {
    const colorFields = ['primaryColor', 'secondaryColor', 'backgroundColor', 'textColor', 'errorColor'];
    for (const field of colorFields) {
      expect(() => validateThemeConfig({ [field]: 'invalid' })).toThrow();
    }
  });

  it('allows zero border radius', () => {
    const config = validateThemeConfig({ borderRadius: 0 });
    expect(config.borderRadius).toBe(0);
  });
});
