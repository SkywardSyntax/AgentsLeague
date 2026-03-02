import { describe, expect, it } from 'vitest';
import {
  ellipsePoints,
  arrowHeadPoints,
  linePoints,
  escapePlainTextForTex,
  looksMathLikeText,
  strokesBounds,
} from '@/lib/whiteboard/semantic-to-strokes';
import type { StrokeTrajectory } from '@/types/agent';

describe('ellipsePoints', () => {
  it('produces closed polygon with steps based on circumference/5, min 36', () => {
    const el = { type: 'ellipse' as const, id: 'e1', cx: 100, cy: 100, rx: 50, ry: 30 };
    const pts = ellipsePoints(el);
    const circumference = Math.PI * (3 * (el.rx + el.ry) - Math.sqrt((3 * el.rx + el.ry) * (el.rx + 3 * el.ry)));
    const expectedSteps = Math.max(36, Math.ceil(circumference / 5));
    expect(pts.length).toBe(expectedSteps + 1);
    // First and last points should be approximately equal (closure)
    expect(pts[0]!.x).toBeCloseTo(pts[pts.length - 1]!.x, 8);
    expect(pts[0]!.y).toBeCloseTo(pts[pts.length - 1]!.y, 8);
  });

  it('returns at least 37 points (min 36 steps + 1) for degenerate rx=0', () => {
    const el = { type: 'ellipse' as const, id: 'e2', cx: 0, cy: 0, rx: 0, ry: 50 };
    const pts = ellipsePoints(el);
    expect(pts.length).toBeGreaterThanOrEqual(37);
    // All x coords should be at cx since rx=0
    for (const p of pts) {
      expect(p.x).toBeCloseTo(0, 8);
    }
  });

  it('produces finite points for very large rx', () => {
    const el = { type: 'ellipse' as const, id: 'e3', cx: 0, cy: 0, rx: 15000, ry: 10 };
    const pts = ellipsePoints(el);
    expect(pts.length).toBeGreaterThan(36);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe('linePoints', () => {
  it('returns two-point array for a line', () => {
    const el = { type: 'line' as const, id: 'l1', from: { x: 0, y: 0 }, to: { x: 10, y: 20 } };
    const pts = linePoints(el);
    expect(pts).toEqual([{ x: 0, y: 0 }, { x: 10, y: 20 }]);
  });

  it('returns two-point array for a diagonal', () => {
    const el = { type: 'line' as const, id: 'l2', from: { x: -5, y: -5 }, to: { x: 100, y: 200 } };
    const pts = linePoints(el);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toEqual({ x: -5, y: -5 });
    expect(pts[1]).toEqual({ x: 100, y: 200 });
  });
});

describe('arrowHeadPoints', () => {
  it('returns two wing segments for a normal arrow', () => {
    const el = { type: 'arrow' as const, id: 'a1', from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const wings = arrowHeadPoints(el);
    expect(wings).toHaveLength(2);
    expect(wings[0]).toHaveLength(2);
    expect(wings[1]).toHaveLength(2);
    // Both wings end at the arrow tip
    expect(wings[0]![1]).toEqual(el.to);
    expect(wings[1]![1]).toEqual(el.to);
  });

  it('still returns two wing segments for zero-length arrow (from===to)', () => {
    const el = { type: 'arrow' as const, id: 'a2', from: { x: 50, y: 50 }, to: { x: 50, y: 50 } };
    const wings = arrowHeadPoints(el);
    expect(wings).toHaveLength(2);
    // Min head length is 8, so wings should have valid points (no NaN)
    for (const wing of wings) {
      for (const pt of wing) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it('head length is proportional to shaft length clamped to [8, 24]', () => {
    const short = { type: 'arrow' as const, id: 'a3', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };
    const shortWings = arrowHeadPoints(short);
    const shortHeadLen = Math.hypot(
      shortWings[0]![0]!.x - short.to.x,
      shortWings[0]![0]!.y - short.to.y,
    );
    expect(shortHeadLen).toBeCloseTo(8, 1); // min clamp

    const long = { type: 'arrow' as const, id: 'a4', from: { x: 0, y: 0 }, to: { x: 500, y: 0 } };
    const longWings = arrowHeadPoints(long);
    const longHeadLen = Math.hypot(
      longWings[0]![0]!.x - long.to.x,
      longWings[0]![0]!.y - long.to.y,
    );
    expect(longHeadLen).toBeCloseTo(24, 1); // max clamp
  });
});

describe('escapePlainTextForTex', () => {
  it('escapes special TeX characters including ~', () => {
    const input = '#$%&_{} ~^\\';
    const escaped = escapePlainTextForTex(input);
    expect(escaped).toBe('\\#\\$\\%\\&\\_\\{\\} \\~\\^\\\\');
  });

  it('passes through plain ASCII unchanged', () => {
    expect(escapePlainTextForTex('Hello World 123')).toBe('Hello World 123');
  });

  it('handles empty string', () => {
    expect(escapePlainTextForTex('')).toBe('');
  });
});

describe('looksMathLikeText', () => {
  it('detects LaTeX commands like \\frac', () => {
    expect(looksMathLikeText('\\frac{1}{2}')).toBe(true);
  });

  it('detects superscript notation x^2', () => {
    expect(looksMathLikeText('x^2')).toBe(true);
  });

  it('detects subscript notation a_{n}', () => {
    expect(looksMathLikeText('a_{n}')).toBe(true);
  });

  it('requires both equation char AND operator for = to trigger', () => {
    // Plain "=" alone is not enough; needs both [=±] and [+\\-*/^]
    expect(looksMathLikeText('=')).toBe(false);
    expect(looksMathLikeText('x = y + z')).toBe(true);
  });

  it('rejects plain prose', () => {
    expect(looksMathLikeText('hello world')).toBe(false);
  });

  it('returns false for empty/whitespace input', () => {
    expect(looksMathLikeText('')).toBe(false);
    expect(looksMathLikeText('   ')).toBe(false);
  });
});

describe('strokesBounds', () => {
  const makeStroke = (pts: Array<{ x: number; y: number }>): StrokeTrajectory => ({
    id: 's',
    elementId: 'e',
    color: '#000',
    baseWidth: 1,
    points: pts,
  });

  it('computes bounds for a single stroke', () => {
    const bounds = strokesBounds([makeStroke([{ x: 0, y: 5 }, { x: 10, y: 15 }])]);
    expect(bounds).toEqual({ minX: 0, maxX: 10, minY: 5, maxY: 15, width: 10, height: 10 });
  });

  it('computes bounds across multiple strokes', () => {
    const bounds = strokesBounds([
      makeStroke([{ x: 0, y: 0 }, { x: 5, y: 5 }]),
      makeStroke([{ x: -10, y: -10 }, { x: 20, y: 20 }]),
    ]);
    expect(bounds).toEqual({ minX: -10, maxX: 20, minY: -10, maxY: 20, width: 30, height: 30 });
  });

  it('returns null for empty array', () => {
    expect(strokesBounds([])).toBeNull();
  });

  it('returns null for non-empty array of empty sub-arrays (no points)', () => {
    expect(strokesBounds([makeStroke([]), makeStroke([])])).toBeNull();
  });

  it('returns zero-area bounds for all-identical points', () => {
    const bounds = strokesBounds([makeStroke([{ x: 5, y: 5 }, { x: 5, y: 5 }])]);
    expect(bounds).toEqual({ minX: 5, maxX: 5, minY: 5, maxY: 5, width: 0, height: 0 });
  });
});
