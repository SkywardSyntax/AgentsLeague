import { describe, expect, it } from 'vitest';
import { extractSvgStrokes } from '@/lib/latex/mathjax-client';

const defaultOpts = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  strokeIdPrefix: 'tf',
  color: '#000',
  baseWidth: 1.5,
};

describe('SVG transform parsing via extractSvgStrokes', () => {
  it('composes translate and scale in a single transform attribute', () => {
    const svg = `<svg viewBox="0 0 100 100"><g transform="translate(10,0) scale(2)"><path d="M0 0 L10 0"/></g></svg>`;
    const result = extractSvgStrokes(svg, defaultOpts);

    expect(result).toHaveLength(1);
    const xs = result[0]!.points.map((p) => p.x);
    // After scale(2): 0→0, 10→20. After translate(10,0): 0→10, 20→30.
    // Compose: translate(10,0)*scale(2) means scale first, then translate.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(31);
  });

  it('accumulates transforms from nested <g> elements', () => {
    const svg = `<svg viewBox="0 0 200 200"><g transform="translate(50,50)"><g transform="scale(2)"><path d="M0 0 L10 0"/></g></g></svg>`;
    const result = extractSvgStrokes(svg, defaultOpts);

    expect(result).toHaveLength(1);
    const xs = result[0]!.points.map((p) => p.x);
    // Inner scale(2): 0→0, 10→20. Outer translate(50,50): 0→50, 20→70.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(49);
    expect(Math.max(...xs)).toBeLessThanOrEqual(71);
  });

  it('applies matrix() transform correctly', () => {
    // matrix(2, 0, 0, 2, 10, 20) = scale(2) + translate(10, 20) via matrix notation
    const svg = `<svg viewBox="0 0 200 200"><g transform="matrix(2, 0, 0, 2, 10, 20)"><path d="M0 0 L5 0"/></g></svg>`;
    const result = extractSvgStrokes(svg, defaultOpts);

    expect(result).toHaveLength(1);
    const xs = result[0]!.points.map((p) => p.x);
    const ys = result[0]!.points.map((p) => p.y);
    // x: 0*2+10=10, 5*2+10=20. y: 0*2+20=20
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(21);
    expect(ys.every((y) => Math.abs(y - 20) < 1)).toBe(true);
  });

  it('uses identity viewport when no viewBox is present', () => {
    const svg = `<svg><path d="M0 0 L50 0"/></svg>`;
    const result = extractSvgStrokes(svg, defaultOpts);

    expect(result).toHaveLength(1);
    const xs = result[0]!.points.map((p) => p.x);
    // No viewBox → identity viewport, points at raw SVG coordinates
    expect(Math.min(...xs)).toBeCloseTo(0, 0);
    expect(Math.max(...xs)).toBeCloseTo(50, 0);
  });

  it('returns identity viewport for zero-width viewBox without crashing', () => {
    const svg = `<svg viewBox="0 0 0 100"><path d="M0 0 L10 0"/></svg>`;
    const result = extractSvgStrokes(svg, defaultOpts);

    expect(result).toHaveLength(1);
    // Zero-width viewBox → identity matrix, no divide by zero
    const points = result[0]!.points;
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('applies the scale option to all output points', () => {
    const svg = `<svg viewBox="0 0 100 100"><path d="M0 0 L10 0"/></svg>`;
    const result1x = extractSvgStrokes(svg, { ...defaultOpts, scale: 1 });
    const result3x = extractSvgStrokes(svg, { ...defaultOpts, scale: 3 });

    expect(result1x).toHaveLength(1);
    expect(result3x).toHaveLength(1);
    const maxX1 = Math.max(...result1x[0]!.points.map((p) => p.x));
    const maxX3 = Math.max(...result3x[0]!.points.map((p) => p.x));
    expect(maxX3).toBeCloseTo(maxX1 * 3, 0);
  });
});
