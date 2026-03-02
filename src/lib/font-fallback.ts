export const FONT_STACK = {
  display: ['"SF Pro Display"', '"Helvetica Neue"', '"Segoe UI"', '"Avenir Next"', 'sans-serif'],
  body: ['"SF Pro Text"', '"Helvetica Neue"', '"Segoe UI"', '"Avenir Next"', 'sans-serif'],
  mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', '"Cascadia Code"', 'Monaco', 'Consolas', 'monospace'],
} as const;

export function buildFontFamily(stack: readonly string[]): string {
  return stack.join(', ');
}

export function isFontAvailable(fontName: string): boolean {
  if (typeof document === 'undefined') return false;
  const testString = 'mmmmmmmmmmlli';
  const baseFonts = ['monospace', 'sans-serif', 'serif'] as const;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const baseWidths = baseFonts.map((base) => {
    ctx.font = `72px ${base}`;
    return ctx.measureText(testString).width;
  });

  return baseFonts.some((base, idx) => {
    ctx.font = `72px ${fontName}, ${base}`;
    return ctx.measureText(testString).width !== baseWidths[idx];
  });
}

export function getFirstAvailableFont(stack: readonly string[]): string {
  for (const font of stack) {
    const clean = font.replace(/"/g, '');
    if (clean === 'sans-serif' || clean === 'serif' || clean === 'monospace') return clean;
    if (isFontAvailable(clean)) return font;
  }
  return 'sans-serif';
}

export function estimateCharWidth(fontSize: number): number {
  // Conservative width estimate that works across font families
  return fontSize * 0.55;
}
