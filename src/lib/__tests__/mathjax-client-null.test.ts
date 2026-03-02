import { describe, expect, it } from 'vitest';
import { extractSvgStrokes } from '@/lib/latex/mathjax-client';

const defaultOpts = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  strokeIdPrefix: 'null-test',
  color: '#000',
  baseWidth: 1,
};

describe('extractSvgStrokes null / edge SVG inputs', () => {
  it('SVG with % width/height still extracts strokes using viewBox fallback', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 50"><path d="M0 0 L100 0 L100 50 L0 50 Z"/></svg>`;
    const result = extractSvgStrokes(svg, defaultOpts);

    expect(result.length).toBeGreaterThan(0);
    const xs = result.flatMap((s) => s.points.map((p) => p.x));
    const ys = result.flatMap((s) => s.points.map((p) => p.y));
    // Points should fall within viewBox dimensions (0-100 x, 0-50 y)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(101);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(51);
  });

  it('SVG with no viewBox uses identity matrix', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="M10 10 L90 10"/></svg>`;
    const result = extractSvgStrokes(svg, defaultOpts);

    expect(result.length).toBe(1);
    const xs = result[0]!.points.map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(91);
  });

  it('SVG with zero-dimension viewBox returns identity (strokes may extract)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"><path d="M0 0 L10 10"/></svg>`;
    // Zero viewBox → identity matrix → path points at raw coordinates
    const result = extractSvgStrokes(svg, defaultOpts);
    // Should not crash; identity matrix fallback means points stay at raw coords
    expect(result).toBeDefined();
    if (result.length > 0) {
      const xs = result[0]!.points.map((p) => p.x);
      expect(xs.every(Number.isFinite)).toBe(true);
    }
  });

  it('SVG with width="NaN" extracts strokes using viewBox fallback', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="NaN" height="NaN" viewBox="0 0 100 50"><path d="M0 25 L100 25"/></svg>`;
    const result = extractSvgStrokes(svg, defaultOpts);

    expect(result.length).toBeGreaterThan(0);
    const xs = result[0]!.points.map((p) => p.x);
    // parseSvgLength returns null for "NaN" → falls back to vbWidth/vbHeight → 1:1 scale
    expect(xs.every(Number.isFinite)).toBe(true);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(101);
  });

  it('SVG with negative dimension width="-10ex" handles gracefully', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="-10ex" height="5ex" viewBox="0 0 80 40"><path d="M0 20 L80 20"/></svg>`;
    const result = extractSvgStrokes(svg, defaultOpts);

    // -10ex parses to -80px → widthPx <= 0 guard → identity matrix fallback
    expect(result.length).toBeGreaterThan(0);
    const xs = result[0]!.points.map((p) => p.x);
    expect(xs.every(Number.isFinite)).toBe(true);
    // With identity fallback (widthPx <= 0), viewBox 80×40 maps 1:1
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(81);
  });
});
