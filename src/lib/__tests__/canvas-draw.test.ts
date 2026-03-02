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

  it('uses bezierCurveTo for 4+ points', () => {
    const ctx = mockCtx();
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
      { x: 30, y: 5 },
    ];
    drawSmoothStroke(ctx, points, '#000', 1, camera, 1);
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.bezierCurveTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});
