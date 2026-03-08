import { describe, it, expect } from 'vitest';
import { exportStrokesToSVG } from '../canvas-export';
import type { StrokeTrajectory } from '@/types/agent';

function makeStroke(
  id: string,
  points: { x: number; y: number }[],
  color = '#000000',
  baseWidth = 2,
): StrokeTrajectory {
  return { id, elementId: `el-${id}`, points, color, baseWidth };
}

describe('exportStrokesToSVG', () => {
  it('returns an empty SVG for no strokes', () => {
    const svg = exportStrokesToSVG([]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="0"');
    expect(svg).toContain('height="0"');
  });

  it('produces valid SVG wrapper with xmlns, width, height, and viewBox', () => {
    const stroke = makeStroke('s1', [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    const svg = exportStrokesToSVG([stroke]);

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('<path');
    expect(svg).toContain('</svg>');
  });

  it('renders a simple 2-point stroke as an L (lineTo) path', () => {
    const stroke = makeStroke('line', [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ]);
    const svg = exportStrokesToSVG([stroke], { padding: 0, whiteBackground: false });

    expect(svg).toContain('M 0 0');
    expect(svg).toContain('L 100 50');
  });

  it('renders a 4+ point stroke as Bézier curves (C commands)', () => {
    const stroke = makeStroke('curve', [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 30, y: 10 },
      { x: 50, y: 30 },
    ]);
    const svg = exportStrokesToSVG([stroke], { padding: 0, whiteBackground: false });

    expect(svg).toContain('M 0 0');
    // Catmull-Rom → Bézier produces C commands
    expect(svg).toMatch(/ C /);
  });

  it('preserves stroke color and width', () => {
    const stroke = makeStroke('colored', [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ], '#ff0000', 3);
    const svg = exportStrokesToSVG([stroke]);

    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('stroke-width="3"');
  });

  it('includes data-stroke-id attribute for each path', () => {
    const stroke = makeStroke('my-id', [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    const svg = exportStrokesToSVG([stroke]);

    expect(svg).toContain('data-stroke-id="my-id"');
  });

  it('includes a white background rect when whiteBackground is true', () => {
    const stroke = makeStroke('s1', [
      { x: 0, y: 0 },
      { x: 20, y: 20 },
    ]);
    const svg = exportStrokesToSVG([stroke], { whiteBackground: true });
    expect(svg).toContain('<rect');
    expect(svg).toContain('fill="#ffffff"');
  });

  it('omits background rect when whiteBackground is false', () => {
    const stroke = makeStroke('s1', [
      { x: 0, y: 0 },
      { x: 20, y: 20 },
    ]);
    const svg = exportStrokesToSVG([stroke], { whiteBackground: false });
    expect(svg).not.toContain('<rect');
  });

  it('renders multiple strokes as separate paths', () => {
    const strokes = [
      makeStroke('a', [{ x: 0, y: 0 }, { x: 10, y: 10 }], '#111111', 1),
      makeStroke('b', [{ x: 20, y: 20 }, { x: 30, y: 30 }], '#222222', 2),
      makeStroke('c', [{ x: 40, y: 40 }, { x: 50, y: 50 }], '#333333', 3),
    ];
    const svg = exportStrokesToSVG(strokes, { whiteBackground: false, padding: 0 });

    const pathCount = (svg.match(/<path /g) ?? []).length;
    expect(pathCount).toBe(3);
    expect(svg).toContain('data-stroke-id="a"');
    expect(svg).toContain('data-stroke-id="b"');
    expect(svg).toContain('data-stroke-id="c"');
  });

  it('applies padding to the viewBox bounds', () => {
    const stroke = makeStroke('s1', [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);
    const svgPadded = exportStrokesToSVG([stroke], { padding: 5, whiteBackground: false });
    const svgNoPad = exportStrokesToSVG([stroke], { padding: 0, whiteBackground: false });

    // Extract viewBox values
    const matchPadded = svgPadded.match(/viewBox="([^"]+)"/);
    const matchNoPad = svgNoPad.match(/viewBox="([^"]+)"/);
    expect(matchPadded).toBeTruthy();
    expect(matchNoPad).toBeTruthy();

    const [pMinX] = matchPadded![1].split(' ').map(Number);
    const [nMinX] = matchNoPad![1].split(' ').map(Number);
    // Padded viewBox should start at a lower coordinate
    expect(pMinX).toBeLessThan(nMinX);
  });

  it('skips single-point strokes (too short to render)', () => {
    const strokes = [
      makeStroke('dot', [{ x: 5, y: 5 }]),
      makeStroke('line', [{ x: 0, y: 0 }, { x: 10, y: 10 }]),
    ];
    const svg = exportStrokesToSVG(strokes, { whiteBackground: false, padding: 0 });

    const pathCount = (svg.match(/<path /g) ?? []).length;
    expect(pathCount).toBe(1);
    expect(svg).toContain('data-stroke-id="line"');
    expect(svg).not.toContain('data-stroke-id="dot"');
  });

  it('sets fill="none" and round line caps on the group', () => {
    const stroke = makeStroke('s1', [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    const svg = exportStrokesToSVG([stroke]);

    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-linejoin="round"');
  });
});
