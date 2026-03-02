import { describe, expect, it, vi } from 'vitest';
import { drawStroke, drawSmoothStroke } from '@/lib/whiteboard/canvas-draw';

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

describe('drawStroke', () => {
  it('does nothing for 0 points', () => {
    const ctx = mockCtx();
    drawStroke(ctx, [], '#000', 1, camera, 1);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('does nothing for 1 point', () => {
    const ctx = mockCtx();
    drawStroke(ctx, [{ x: 5, y: 5 }], '#000', 1, camera, 1);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('draws segments with moveTo/lineTo for 2+ points', () => {
    const ctx = mockCtx();
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    drawStroke(ctx, points, '#ff0000', 2, camera, 1);
    expect(ctx.beginPath).toHaveBeenCalledTimes(2);
    expect(ctx.moveTo).toHaveBeenCalledTimes(2);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it('sets color and line cap/join', () => {
    const ctx = mockCtx();
    drawStroke(ctx, [{ x: 0, y: 0 }, { x: 10, y: 0 }], '#abc', 1, camera, 1);
    expect(ctx.strokeStyle).toBe('#abc');
    expect(ctx.lineCap).toBe('round');
    expect(ctx.lineJoin).toBe('round');
  });
});

describe('drawSmoothStroke', () => {
  it('does nothing for fewer than 2 points', () => {
    const ctx = mockCtx();
    drawSmoothStroke(ctx, [{ x: 0, y: 0 }], '#000', 1, camera, 1);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('falls back to drawStroke for 2-3 points', () => {
    const ctx = mockCtx();
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    drawSmoothStroke(ctx, points, '#000', 1, camera, 1);
    // drawStroke is called (lineTo, not bezierCurveTo)
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.bezierCurveTo).not.toHaveBeenCalled();
  });

  it('uses bezierCurveTo for 4+ points with per-segment modulation', () => {
    const ctx = mockCtx();
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
      { x: 30, y: 5 },
    ];
    drawSmoothStroke(ctx, points, '#000', 1, camera, 1);
    // 3 Bézier segments for 4 points, each with its own beginPath/stroke
    expect(ctx.beginPath).toHaveBeenCalledTimes(3);
    expect(ctx.bezierCurveTo).toHaveBeenCalledTimes(3);
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
  });

  it('handles coincident (identical) points without error', () => {
    const ctx = mockCtx();
    const points = [{ x: 5, y: 5 }, { x: 5, y: 5 }];
    expect(() => drawSmoothStroke(ctx, points, '#000', 1, camera, 1)).not.toThrow();
  });

  it('handles coincident points in drawStroke without error', () => {
    const ctx = mockCtx();
    const points = [{ x: 5, y: 5 }, { x: 5, y: 5 }];
    expect(() => drawStroke(ctx, points, '#000', 1, camera, 1)).not.toThrow();
    expect(ctx.beginPath).toHaveBeenCalled();
  });
});

describe('drawStroke — NaN/Infinity defense', () => {
  it('does not throw with NaN in a point', () => {
    const ctx = mockCtx();
    const points = [{ x: 0, y: 0 }, { x: NaN, y: 10 }];
    expect(() => drawStroke(ctx, points, '#000', 1, camera, 1)).not.toThrow();
    // NaN segment is skipped by the finite-coordinate guard
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });

  it('does not throw with Infinity coordinates', () => {
    const ctx = mockCtx();
    const points = [{ x: 0, y: 0 }, { x: Infinity, y: -Infinity }];
    expect(() => drawStroke(ctx, points, '#000', 1, camera, 1)).not.toThrow();
  });

  it('does not throw with zoom: 0', () => {
    const ctx = mockCtx();
    const cam = { x: 0, y: 0, zoom: 0 };
    const points = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(() => drawStroke(ctx, points, '#000', 2, cam, 1)).not.toThrow();
  });

  it('does not throw with zoom: NaN', () => {
    const ctx = mockCtx();
    const cam = { x: 0, y: 0, zoom: NaN };
    const points = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(() => drawStroke(ctx, points, '#000', 2, cam, 1)).not.toThrow();
  });
});

describe('drawSmoothStroke — NaN/Infinity defense', () => {
  it('does not throw with NaN points (< 4 points, fallback path)', () => {
    const ctx = mockCtx();
    const points = [{ x: NaN, y: 0 }, { x: 10, y: NaN }];
    expect(() => drawSmoothStroke(ctx, points, '#000', 1, camera, 1)).not.toThrow();
  });

  it('does not throw with NaN points (4+ points, bezier path)', () => {
    const ctx = mockCtx();
    const points = [
      { x: 0, y: 0 },
      { x: NaN, y: 5 },
      { x: 20, y: NaN },
      { x: 30, y: 5 },
    ];
    expect(() => drawSmoothStroke(ctx, points, '#000', 1, camera, 1)).not.toThrow();
  });

  it('does not throw with zoom: 0 on smooth path', () => {
    const ctx = mockCtx();
    const cam = { x: 0, y: 0, zoom: 0 };
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
      { x: 30, y: 5 },
    ];
    expect(() => drawSmoothStroke(ctx, points, '#000', 1, cam, 1)).not.toThrow();
  });
});

describe('drawSmoothStroke — per-segment width modulation', () => {
  it('6-point stroke uses per-segment rendering with multiple beginPath calls', () => {
    const ctx = mockCtx();
    const points = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, y: (i % 2) * 5 }));
    drawSmoothStroke(ctx, points, '#000', 2, camera, 1);
    // 5 Bézier segments for 6 points — each gets its own beginPath/stroke
    expect(ctx.beginPath).toHaveBeenCalledTimes(5);
    expect(ctx.stroke).toHaveBeenCalledTimes(5);
  });

  it('lineWidth varies across segments for a 6-point stroke', () => {
    const ctx = mockCtx();
    const lineWidths: number[] = [];
    Object.defineProperty(ctx, 'lineWidth', {
      set(v: number) { lineWidths.push(v); },
      get() { return lineWidths[lineWidths.length - 1] ?? 0; },
    });
    const points = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, y: (i % 2) * 5 }));
    drawSmoothStroke(ctx, points, '#000', 2, camera, 1);
    expect(lineWidths.length).toBeGreaterThanOrEqual(2);
    const unique = new Set(lineWidths);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('250-point stroke uses single-path fast-path (1 beginPath call)', () => {
    const ctx = mockCtx();
    const points = Array.from({ length: 250 }, (_, i) => ({ x: i, y: Math.sin(i) * 10 }));
    drawSmoothStroke(ctx, points, '#000', 2, camera, 1);
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});
