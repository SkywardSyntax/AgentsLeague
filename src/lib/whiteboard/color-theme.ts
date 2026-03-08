export type ColorTheme = 'default' | 'dark' | 'colorful' | 'pastel' | 'monochrome';

export const COLOR_THEMES: readonly ColorTheme[] = ['default', 'dark', 'colorful', 'pastel', 'monochrome'];

export interface ThemeColors {
  axis: string;
  grid: string;
  curve1: string;
  curve2: string;
  curve3: string;
  fill: string;
  text: string;
  background: string;
}

const THEME_MAP: Record<ColorTheme, ThemeColors> = {
  default: {
    axis: '#1f2a44',
    grid: '#cccccc',
    curve1: '#4a90d9',
    curve2: '#e74c3c',
    curve3: '#2ecc71',
    fill: 'rgba(100,149,237,0.3)',
    text: '#1f2a44',
    background: '#f7f9fc',
  },
  dark: {
    axis: '#e0e0e0',
    grid: '#333333',
    curve1: '#00bcd4',
    curve2: '#ff7043',
    curve3: '#66bb6a',
    fill: 'rgba(0,188,212,0.25)',
    text: '#f0f0f0',
    background: '#1a1a2e',
  },
  colorful: {
    axis: '#222222',
    grid: '#dddddd',
    curve1: '#2979ff',
    curve2: '#ff1744',
    curve3: '#00c853',
    fill: 'rgba(255,152,0,0.25)',
    text: '#222222',
    background: '#fffef5',
  },
  pastel: {
    axis: '#5c5c7a',
    grid: '#e0dce8',
    curve1: '#b39ddb',
    curve2: '#f48fb1',
    curve3: '#80cbc4',
    fill: 'rgba(179,157,219,0.2)',
    text: '#5c5c7a',
    background: '#faf5ff',
  },
  monochrome: {
    axis: '#111111',
    grid: '#cccccc',
    curve1: '#333333',
    curve2: '#666666',
    curve3: '#999999',
    fill: 'rgba(0,0,0,0.1)',
    text: '#111111',
    background: '#ffffff',
  },
};

export function getThemeColors(theme: ColorTheme): ThemeColors {
  return THEME_MAP[theme];
}

const CURVE_KEYS: readonly (keyof ThemeColors)[] = ['curve1', 'curve2', 'curve3'];

/** Return the curve color for a given 0-based index, cycling through curve1/2/3. */
export function getCurveColor(theme: ColorTheme, index: number): string {
  const colors = THEME_MAP[theme];
  return colors[CURVE_KEYS[index % CURVE_KEYS.length]!];
}
