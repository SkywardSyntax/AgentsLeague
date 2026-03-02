import { describe, expect, it } from 'vitest';
import {
  svgBounds,
  svgControlPoints,
  svgBezierChain,
  svgIntersection,
  svgPolyline,
  svgDocument,
} from '@/lib/whiteboard/geometry-debug';
import type { StrokeBounds, BezierSegment } from '@/lib/whiteboard/geometry-debug';

describe('geometry-debug-viz', () => {
  const bounds: StrokeBounds = { minX: 10, minY: 20, maxX: 110, maxY: 70 };

  it('svgBounds generates a rect with correct x, y, width, height attributes', () => {
    const svg = svgBounds(bounds);
    expect(svg).toContain('x="10"');
    expect(svg).toContain('y="20"');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
    expect(svg).toContain('<rect');
  });

  it('svgBounds applies custom stroke and fill colours', () => {
    const svg = svgBounds(bounds, { stroke: '#00ff00', fill: 'yellow' });
    expect(svg).toContain('stroke="#00ff00"');
    expect(svg).toContain('fill="yellow"');
  });

  it('svgBounds includes a text label when provided', () => {
    const svg = svgBounds(bounds, { label: 'box-a' });
    expect(svg).toContain('<text');
    expect(svg).toContain('box-a');
  });

  it('svgControlPoints generates one circle per point', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
    ];
    const svg = svgControlPoints(points);
    const circles = svg.match(/<circle/g) ?? [];
    expect(circles.length).toBe(3);
  });

  it('svgBezierChain generates a path with cubic Bézier commands', () => {
    const segments: BezierSegment[] = [
      { start: { x: 0, y: 0 }, cp1: { x: 5, y: 10 }, cp2: { x: 15, y: 10 }, end: { x: 20, y: 0 } },
      { start: { x: 20, y: 0 }, cp1: { x: 25, y: -10 }, cp2: { x: 35, y: -10 }, end: { x: 40, y: 0 } },
    ];
    const svg = svgBezierChain(segments);
    expect(svg).toContain('<path');
    const cCommands = svg.match(/ C /g) ?? [];
    expect(cCommands.length).toBe(2);
  });

  it('svgBezierChain renders control points when showControlPoints is true', () => {
    const segments: BezierSegment[] = [
      { start: { x: 0, y: 0 }, cp1: { x: 5, y: 10 }, cp2: { x: 15, y: 10 }, end: { x: 20, y: 0 } },
    ];
    const svg = svgBezierChain(segments, { showControlPoints: true });
    expect(svg).toContain('<circle');
  });

  it('svgIntersection returns null for non-overlapping bounds', () => {
    const a: StrokeBounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b: StrokeBounds = { minX: 20, minY: 20, maxX: 30, maxY: 30 };
    expect(svgIntersection(a, b)).toBeNull();
  });

  it('svgIntersection returns a rect for overlapping bounds', () => {
    const a: StrokeBounds = { minX: 0, minY: 0, maxX: 20, maxY: 20 };
    const b: StrokeBounds = { minX: 10, minY: 10, maxX: 30, maxY: 30 };
    const svg = svgIntersection(a, b);
    expect(svg).not.toBeNull();
    expect(svg).toContain('<rect');
    expect(svg).toContain('x="10"');
    expect(svg).toContain('y="10"');
    expect(svg).toContain('width="10"');
    expect(svg).toContain('height="10"');
  });

  it('svgPolyline generates correct points attribute', () => {
    const points = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ];
    const svg = svgPolyline(points);
    expect(svg).toContain('points="1,2 3,4 5,6"');
  });

  it('svgDocument wraps fragments in a valid SVG with viewBox', () => {
    const f1 = '<rect x="0" y="0" width="10" height="10" />';
    const f2 = '<circle cx="5" cy="5" r="2" />';
    const svg = svgDocument([f1, f2], { x: 0, y: 0, width: 100, height: 100 });
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain(f1);
    expect(svg).toContain(f2);
    expect(svg).toContain('</svg>');
  });
});
