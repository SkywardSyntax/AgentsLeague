import { describe, it, expect } from 'vitest';
import { makeCoordMapper, type CanvasRect, type MathRange } from '../planner/lowerer';
import { lowerMathPrimitive } from '../planner/lowerer';
import type {
  CartesianAxesElement,
  NumberLineElement,
  DrawElement,
} from '@/types/agent';

// ---------------------------------------------------------------------------
// makeCoordMapper unit tests
// ---------------------------------------------------------------------------
describe('makeCoordMapper', () => {
  const rect: CanvasRect = { x: 100, y: 100, width: 400, height: 300 };
  const range: MathRange = { xMin: -5, xMax: 5, yMin: -3, yMax: 3 };
  const { toCanvasX, toCanvasY, toMathX, toMathY } = makeCoordMapper(rect, range);

  it('maps math origin (0,0) to canvas center (300, 250)', () => {
    expect(toCanvasX(0)).toBeCloseTo(300, 5);
    expect(toCanvasY(0)).toBeCloseTo(250, 5);
  });

  it('maps top-right corner (5,3) to canvas (500, 100)', () => {
    expect(toCanvasX(5)).toBeCloseTo(500, 5);
    expect(toCanvasY(3)).toBeCloseTo(100, 5);
  });

  it('maps bottom-left corner (-5,-3) to canvas (100, 400)', () => {
    expect(toCanvasX(-5)).toBeCloseTo(100, 5);
    expect(toCanvasY(-3)).toBeCloseTo(400, 5);
  });

  it('round-trips through toMath* and back', () => {
    const mx = 2.5, my = -1.5;
    expect(toMathX(toCanvasX(mx))).toBeCloseTo(mx, 10);
    expect(toMathY(toCanvasY(my))).toBeCloseTo(my, 10);
  });

  it('handles zero-span gracefully (falls back to span=1)', () => {
    const mapper = makeCoordMapper(
      { x: 0, y: 0, width: 100, height: 100 },
      { xMin: 3, xMax: 3, yMin: 3, yMax: 3 },
    );
    // With zero span (clamped to 1), (3,3) maps to origin
    expect(Number.isFinite(mapper.toCanvasX(3))).toBe(true);
    expect(Number.isFinite(mapper.toCanvasY(3))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Number line coordinate mapping
// ---------------------------------------------------------------------------
describe('expandNumberLine coordinate mapping', () => {
  function makeNumberLine(min: number, max: number, x: number, length: number): NumberLineElement {
    return {
      id: 'nl-test',
      type: 'number_line',
      x,
      y: 300,
      length,
      min,
      max,
      stroke_width: 1,
      color: '#000',
    };
  }

  function findArrowElement(elements: DrawElement[]) {
    return elements.find((e) => e.type === 'arrow') as Extract<DrawElement, { type: 'arrow' }> | undefined;
  }

  function findTickAtValue(elements: DrawElement[], value: number, x: number, length: number, min: number, max: number) {
    const expectedX = x + (value - min) / (max - min) * length;
    return elements.find(
      (e) => e.type === 'line' && e.id.includes('-tick-') &&
        Math.abs((e as Extract<DrawElement, { type: 'line' }>).from.x - expectedX) < 0.1,
    );
  }

  it('value=-2 maps to x=100 (left end) for range [-2,2] at x=100 len=400', () => {
    const el = makeNumberLine(-2, 2, 100, 400);
    const elements = lowerMathPrimitive(el);
    // value=-2 → canvas x = 100 + (-2 - -2)/(2 - -2) * 400 = 100
    const tick = findTickAtValue(elements, -2, 100, 400, -2, 2);
    expect(tick).toBeDefined();
  });

  it('value=0 maps to x=300 (center) for range [-2,2] at x=100 len=400', () => {
    const el = makeNumberLine(-2, 2, 100, 400);
    const elements = lowerMathPrimitive(el);
    // value=0 → canvas x = 100 + (0 - -2)/(4) * 400 = 300
    const tick = findTickAtValue(elements, 0, 100, 400, -2, 2);
    expect(tick).toBeDefined();
  });

  it('value=2 maps to x=500 (right end) for range [-2,2] at x=100 len=400', () => {
    const el = makeNumberLine(-2, 2, 100, 400);
    const elements = lowerMathPrimitive(el);
    // value=2 → canvas x = 100 + (2 - -2)/(4) * 400 = 500
    const tick = findTickAtValue(elements, 2, 100, 400, -2, 2);
    expect(tick).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Cartesian axes coordinate mapping
// ---------------------------------------------------------------------------
describe('expandCartesianAxes coordinate mapping', () => {
  function makeAxes(): CartesianAxesElement {
    return {
      id: 'axes-test',
      type: 'cartesian_axes',
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      xRange: [-5, 5],
      yRange: [-3, 3],
      stroke_width: 1,
      color: '#000',
    };
  }

  it('origin (0,0) maps to canvas center of rect', () => {
    const el = makeAxes();
    const elements = lowerMathPrimitive(el);
    // The x-axis arrow goes through originY = toCanvasY(0)
    const xAxis = elements.find((e) => e.id === 'axes-test-x-axis') as Extract<DrawElement, { type: 'arrow' }>;
    expect(xAxis).toBeDefined();
    // originY = 100 + 300 - (0 - -3)/6 * 300 = 100 + 300 - 150 = 250
    expect(xAxis.from.y).toBeCloseTo(250, 5);
    expect(xAxis.to.y).toBeCloseTo(250, 5);

    // The y-axis arrow goes through originX = toCanvasX(0)
    const yAxis = elements.find((e) => e.id === 'axes-test-y-axis') as Extract<DrawElement, { type: 'arrow' }>;
    expect(yAxis).toBeDefined();
    // originX = 100 + (0 - -5)/10 * 400 = 100 + 200 = 300
    expect(yAxis.from.x).toBeCloseTo(300, 5);
    expect(yAxis.to.x).toBeCloseTo(300, 5);
  });
});
