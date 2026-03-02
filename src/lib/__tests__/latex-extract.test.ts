import { describe, expect, it } from 'vitest';
import { extractSvgStrokes } from '@/lib/latex/mathjax-client';

describe('latex path extraction', () => {
  it('extracts paths from svg markup into trajectories', () => {
    const svg = `<svg viewBox="0 0 100 100"><g transform="translate(10, 20)"><path d="M0 0 L20 0 L20 20"/></g></svg>`;
    const result = extractSvgStrokes(svg, {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      strokeIdPrefix: 'test',
      color: '#111',
      baseWidth: 1.5,
    });

    expect(result.length).toBe(1);
    expect(result[0]?.points.length).toBeGreaterThan(2);
  });

  it('maps viewBox units into SVG viewport pixels before emitting trajectories', () => {
    const svg = `<svg viewBox="0 -100 1000 200" width="10px" height="2px"><g transform="scale(1,-1)"><path d="M0 0 L1000 0"/></g></svg>`;
    const result = extractSvgStrokes(svg, {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      strokeIdPrefix: 'scaled',
      color: '#111',
      baseWidth: 1.5,
    });

    expect(result.length).toBe(1);
    const xs = result[0]!.points.map((p) => p.x);
    const ys = result[0]!.points.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);

    expect(width).toBeLessThanOrEqual(10.2);
    expect(width).toBeGreaterThanOrEqual(9.8);
    expect(height).toBeLessThan(0.2);
  });

  it('splits disconnected subpaths so no artificial connector line is created', () => {
    const svg = `<svg viewBox="0 0 100 20"><path d="M0 10 L20 10 M80 10 L100 10"/></svg>`;
    const result = extractSvgStrokes(svg, {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      strokeIdPrefix: 'split',
      color: '#111',
      baseWidth: 1.5,
    });

    expect(result.length).toBe(2);
    const sortedByMinX = [...result].sort(
      (a, b) => Math.min(...a.points.map((p) => p.x)) - Math.min(...b.points.map((p) => p.x)),
    );
    const firstMaxX = Math.max(...sortedByMinX[0]!.points.map((p) => p.x));
    const secondMinX = Math.min(...sortedByMinX[1]!.points.map((p) => p.x));
    expect(secondMinX - firstMaxX).toBeGreaterThan(30);
  });

  it('extracts thin rect primitives (fraction bars) into drawable strokes', () => {
    const svg = `<svg viewBox="0 0 100 20"><rect x="10" y="9" width="80" height="2"/></svg>`;
    const result = extractSvgStrokes(svg, {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      strokeIdPrefix: 'frac-bar',
      color: '#111',
      baseWidth: 1.5,
    });

    expect(result.length).toBe(1);
    const xs = result[0]!.points.map((p) => p.x);
    const ys = result[0]!.points.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width).toBeGreaterThan(70);
    expect(height).toBeLessThan(1);
  });
});
