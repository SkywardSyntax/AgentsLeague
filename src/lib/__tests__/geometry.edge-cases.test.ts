import { describe, expect, it, vi } from 'vitest';
import {
  distance,
  cumulativeLengths,
  resamplePolyline,
  partialPolylineByLength,
  totalLength,
  strokesBoundingBox,
  catmullRomToBezier,
  bezierPointAt,
  bezierLength,
  assertFinitePoints,
} from '@/lib/whiteboard/geometry';
import { drawStroke, drawSmoothStroke } from '@/lib/whiteboard/canvas-draw';
import { weightedVisibleLength, cornerSpeedFactors } from '@/lib/whiteboard/stroke-scheduler';

function mockCtx() {
  return {
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

const camera = { x: 0, y: 0, zoom: 1 };

describe('NaN coordinate propagation', () => {
  it('distance with NaN input returns NaN', () => {
    expect(Number.isNaN(distance({ x: NaN, y: 0 }, { x: 1, y: 1 }))).toBe(true);
    expect(Number.isNaN(distance({ x: 0, y: NaN }, { x: 1, y: 1 }))).toBe(true);
    expect(Number.isNaN(distance({ x: 0, y: 0 }, { x: NaN, y: 1 }))).toBe(true);
  });

  it('cumulativeLengths with NaN point produces NaN entries', () => {
    const result = cumulativeLengths([{ x: NaN, y: 0 }, { x: 1, y: 1 }]);
    expect(result[0]).toBe(0);
    expect(Number.isNaN(result[1])).toBe(true);
  });

  it('resamplePolyline with NaN coordinate does not infinite-loop', () => {
    const pts = [{ x: NaN, y: 0 }, { x: 1, y: 1 }, { x: 10, y: 0 }];
    const result = resamplePolyline(pts, 5);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('totalLength with NaN points returns NaN', () => {
    const result = totalLength([{ x: 0, y: 0 }, { x: NaN, y: 0 }]);
    expect(Number.isNaN(result)).toBe(true);
  });
});

describe('Infinity coordinate handling', () => {
  it('strokesBoundingBox with Infinity coordinates returns null', () => {
    const result = strokesBoundingBox([
      { points: [{ x: Infinity, y: 0 }, { x: 1, y: 1 }] },
    ]);
    expect(result).toBeNull();
  });

  it('strokesBoundingBox with -Infinity coordinates returns null', () => {
    const result = strokesBoundingBox([
      { points: [{ x: 0, y: -Infinity }, { x: 1, y: 1 }] },
    ]);
    expect(result).toBeNull();
  });

  it('distance with Infinity returns Infinity', () => {
    const d = distance({ x: 0, y: 0 }, { x: Infinity, y: 0 });
    expect(d).toBe(Infinity);
  });

  it('resamplePolyline with Infinity coordinate does not hang', () => {
    const pts = [{ x: 0, y: 0 }, { x: Infinity, y: 0 }];
    const result = resamplePolyline(pts, 10);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('coincident points edge cases', () => {
  it('catmullRomToBezier with all coincident points produces valid segments', () => {
    const pts = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    const segs = catmullRomToBezier(pts);
    expect(segs.length).toBe(3);
    for (const seg of segs) {
      const mid = bezierPointAt(seg, 0.5);
      expect(Number.isFinite(mid.x)).toBe(true);
      expect(Number.isFinite(mid.y)).toBe(true);
      expect(mid.x).toBeCloseTo(5, 5);
      expect(mid.y).toBeCloseTo(5, 5);
    }
  });

  it('bezierLength of degenerate (zero-length) segment returns 0', () => {
    const seg = {
      p0: { x: 3, y: 3 },
      cp1: { x: 3, y: 3 },
      cp2: { x: 3, y: 3 },
      p3: { x: 3, y: 3 },
    };
    expect(bezierLength(seg)).toBe(0);
  });

  it('cornerSpeedFactors with all coincident points returns minFactor for interior', () => {
    const pts = [
      { x: 7, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 7 },
    ];
    const factors = cornerSpeedFactors(pts);
    expect(factors[0]).toBe(1);
    expect(factors[3]).toBe(1);
    expect(factors[1]).toBe(0.35);
    expect(factors[2]).toBe(0.35);
  });
});

describe('degenerate input edge cases', () => {
  it('partialPolylineByLength with cumulative length mismatch still produces output', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    // Mismatched cumulative (only 2 entries for 3 points)
    const result = partialPolylineByLength(pts, [0, 10], 5);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('weightedVisibleLength with factors/cumLens length mismatch falls back to linear', () => {
    const cumLens = [0, 10, 20];
    const mismatchedFactors = [1, 1]; // 2 instead of 3
    const result = weightedVisibleLength(cumLens, mismatchedFactors, 0.5);
    // Falls back to totalLen * t = 20 * 0.5 = 10
    expect(result).toBeCloseTo(10, 5);
  });

  it('weightedVisibleLength result never exceeds totalLen (float precision)', () => {
    // Construct scenario where float imprecision might push result > totalLen
    const cumLens = [0, 0.1, 0.3, 0.6, 1.0, 1.5, 2.1, 2.8, 3.6, 4.5, 5.5];
    const factors = Array.from({ length: cumLens.length }, () => 1);

    for (let t = 0; t <= 1; t += 0.001) {
      const result = weightedVisibleLength(cumLens, factors, t);
      expect(result).toBeLessThanOrEqual(cumLens[cumLens.length - 1]!);
      expect(result).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('canvas-draw NaN defense — no non-finite args to canvas API', () => {
  it('drawStroke skips segments with NaN coordinates', () => {
    const ctx = mockCtx();
    const points = [
      { x: 0, y: 0 },
      { x: NaN, y: 10 },
      { x: 20, y: 0 },
    ];
    drawStroke(ctx, points, '#000', 1, camera, 1);

    // Verify no lineTo/moveTo call received NaN
    for (const call of (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls) {
      expect(Number.isFinite(call[0])).toBe(true);
      expect(Number.isFinite(call[1])).toBe(true);
    }
    for (const call of (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls) {
      expect(Number.isFinite(call[0])).toBe(true);
      expect(Number.isFinite(call[1])).toBe(true);
    }
  });

  it('drawSmoothStroke skips bezier segments with NaN control points', () => {
    const ctx = mockCtx();
    const points = [
      { x: 0, y: 0 },
      { x: NaN, y: 5 },
      { x: 20, y: 0 },
      { x: 30, y: 5 },
    ];
    drawSmoothStroke(ctx, points, '#000', 1, camera, 1);

    // Verify no bezierCurveTo call received NaN
    for (const call of (ctx.bezierCurveTo as ReturnType<typeof vi.fn>).mock.calls) {
      for (const arg of call) {
        expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('drawStroke with all-Infinity points emits no lineTo calls', () => {
    const ctx = mockCtx();
    const points = [
      { x: Infinity, y: 0 },
      { x: 0, y: Infinity },
    ];
    drawStroke(ctx, points, '#000', 1, camera, 1);
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });

  it('drawSmoothStroke with NaN start point does not call moveTo with NaN', () => {
    const ctx = mockCtx();
    const points = [
      { x: NaN, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
      { x: 30, y: 5 },
    ];
    drawSmoothStroke(ctx, points, '#000', 1, camera, 1);

    for (const call of (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls) {
      expect(Number.isFinite(call[0])).toBe(true);
      expect(Number.isFinite(call[1])).toBe(true);
    }
  });
});

describe('assertFinitePoints', () => {
  it('warns on non-finite coordinate in development', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    assertFinitePoints([{ x: 0, y: 0 }, { x: NaN, y: 1 }], 'testFn');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('testFn');
    expect(warnSpy.mock.calls[0]![0]).toContain('index 1');
    warnSpy.mockRestore();
  });

  it('does not warn for all-finite points', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    assertFinitePoints([{ x: 0, y: 0 }, { x: 1, y: 1 }], 'testFn');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns on Infinity coordinate', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    assertFinitePoints([{ x: Infinity, y: 0 }], 'testFn');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('does not warn for empty array', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    assertFinitePoints([], 'testFn');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
