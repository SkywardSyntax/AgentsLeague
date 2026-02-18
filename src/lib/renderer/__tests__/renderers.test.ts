/**
 * Unit tests for shape renderers.
 * Uses a mock CanvasRenderingContext2D to assert correct method calls.
 */

import { renderRect } from '../shape-renderers/rect';
import { renderEllipse } from '../shape-renderers/ellipse';
import { renderLine } from '../shape-renderers/line';
import { renderArrow } from '../shape-renderers/arrow';
import { renderFreehand } from '../shape-renderers/freehand';
import { renderText } from '../shape-renderers/text';
import { renderImage } from '../shape-renderers/image';
import { parseColor } from '../StyleManager';
import type {
  RectElement,
  EllipseElement,
  LineElement,
  ArrowElement,
  FreehandElement,
  TextElement,
  ImageElement,
  StrokeStyle,
  FillStyle,
  TextStyle,
} from '@/types/drawing';

// ── Mock canvas context ──────────────────────────────────

function createMockCtx(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = [];

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop === 'calls') return calls;
      if (prop === 'canvas') return { width: 800, height: 600 };
      if (typeof target[prop] === 'function') return target[prop];
      return target[prop] ?? '';
    },
    set(target, prop: string, value) {
      calls.push(`set:${prop}=${String(value)}`);
      target[prop] = value;
      return true;
    },
  };

  const methods = [
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'rect', 'fill', 'stroke', 'save', 'restore',
    'translate', 'rotate', 'scale', 'setTransform',
    'clearRect', 'fillRect', 'strokeRect', 'fillText',
    'setLineDash', 'quadraticCurveTo', 'drawImage',
  ];

  const target: Record<string, unknown> = {
    measureText: (text: string) => {
      calls.push(`measureText:${text}`);
      return { width: text.length * 8 };
    },
  };

  for (const m of methods) {
    target[m] = (...args: unknown[]) => {
      calls.push(`${m}(${args.map(String).join(',')})`);
    };
  }

  return new Proxy(target, handler) as unknown as CanvasRenderingContext2D & {
    calls: string[];
  };
}

// ── Shared fixtures ──────────────────────────────────────

const baseProps = {
  id: 'test-1',
  x: 10,
  y: 20,
  rotation: 0,
  opacity: 1,
  locked: false,
  createdAt: 0,
  updatedAt: 0,
};

const defaultStroke: StrokeStyle = {
  color: '#333333' as `#${string}`,
  width: 2,
  lineCap: 'round',
  lineJoin: 'round',
};

const defaultFill: FillStyle = {
  type: 'solid',
  color: '#ff0000' as `#${string}`,
  opacity: 1,
};

// ── Tests ────────────────────────────────────────────────

describe('RectangleRenderer', () => {
  it('draws a filled and stroked rectangle', () => {
    const ctx = createMockCtx();
    const el: RectElement = {
      ...baseProps,
      type: 'rect',
      w: 100,
      h: 50,
      cornerRadius: 0,
      fill: defaultFill,
      stroke: defaultStroke,
    };

    renderRect(ctx, el);

    expect(ctx.calls).toContainEqual(expect.stringContaining('beginPath'));
    expect(ctx.calls).toContainEqual(expect.stringContaining('rect('));
    expect(ctx.calls).toContainEqual(expect.stringContaining('fill'));
    expect(ctx.calls).toContainEqual(expect.stringContaining('stroke'));
  });

  it('draws rounded corners via arcTo', () => {
    const ctx = createMockCtx();
    const el: RectElement = {
      ...baseProps,
      type: 'rect',
      w: 100,
      h: 50,
      cornerRadius: 8,
      fill: { type: 'none', color: '#000000' as `#${string}`, opacity: 0 },
      stroke: defaultStroke,
    };

    renderRect(ctx, el);

    const arcToCalls = ctx.calls.filter((c) => c.startsWith('arcTo'));
    expect(arcToCalls.length).toBe(4);
  });
});

describe('EllipseRenderer', () => {
  it('draws an ellipse arc path', () => {
    const ctx = createMockCtx();
    const el: EllipseElement = {
      ...baseProps,
      type: 'ellipse',
      rx: 50,
      ry: 30,
      fill: defaultFill,
      stroke: defaultStroke,
    };

    renderEllipse(ctx, el);

    expect(ctx.calls).toContainEqual(expect.stringContaining('ellipse('));
    expect(ctx.calls).toContainEqual(expect.stringContaining('fill'));
  });
});

describe('LineRenderer', () => {
  it('draws a line from moveTo to lineTo', () => {
    const ctx = createMockCtx();
    const el: LineElement = {
      ...baseProps,
      type: 'line',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
      stroke: defaultStroke,
    };

    renderLine(ctx, el);

    expect(ctx.calls).toContainEqual(expect.stringContaining('moveTo('));
    expect(ctx.calls).toContainEqual(expect.stringContaining('lineTo('));
    expect(ctx.calls).toContainEqual(expect.stringContaining('stroke'));
  });
});

describe('ArrowRenderer', () => {
  it('draws shaft and arrowhead', () => {
    const ctx = createMockCtx();
    const el: ArrowElement = {
      ...baseProps,
      type: 'arrow',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      stroke: defaultStroke,
      startArrowhead: 'none',
      endArrowhead: 'arrow',
    };

    renderArrow(ctx, el);

    expect(ctx.calls).toContainEqual(expect.stringContaining('moveTo('));
    expect(ctx.calls).toContainEqual(expect.stringContaining('lineTo('));
    // Arrowhead draws fill
    expect(ctx.calls).toContainEqual(expect.stringContaining('fill('));
    expect(ctx.calls).toContainEqual(expect.stringContaining('save('));
    expect(ctx.calls).toContainEqual(expect.stringContaining('restore('));
  });
});

describe('FreehandRenderer', () => {
  it('uses quadratic curves for smooth paths', () => {
    const ctx = createMockCtx();
    const el: FreehandElement = {
      ...baseProps,
      type: 'freehand',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 15 },
        { x: 20, y: 10 },
        { x: 30, y: 25 },
      ],
      stroke: defaultStroke,
    };

    renderFreehand(ctx, el);

    const qCurves = ctx.calls.filter((c) =>
      c.startsWith('quadraticCurveTo'),
    );
    expect(qCurves.length).toBeGreaterThanOrEqual(2);
    expect(ctx.calls).toContainEqual(expect.stringContaining('stroke'));
  });
});

describe('TextRenderer', () => {
  it('calls fillText with correct content', () => {
    const ctx = createMockCtx();
    const style: TextStyle = {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: 0,
      color: '#000000' as `#${string}`,
      align: 'left',
    };
    const el: TextElement = {
      ...baseProps,
      type: 'text',
      content: 'Hello World',
      w: 200,
      h: 50,
      style,
    };

    renderText(ctx, el);

    const fillCalls = ctx.calls.filter((c) => c.startsWith('fillText'));
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);
    expect(fillCalls[0]).toContain('Hello World');
  });

  it('wraps long text into multiple lines', () => {
    const ctx = createMockCtx();
    const style: TextStyle = {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: 0,
      color: '#000000' as `#${string}`,
      align: 'left',
    };
    const el: TextElement = {
      ...baseProps,
      type: 'text',
      content: 'This is a very long text that should be wrapped into multiple lines',
      w: 80, // narrow width forces wrapping
      h: 200,
      style,
    };

    renderText(ctx, el);

    const fillCalls = ctx.calls.filter((c) => c.startsWith('fillText'));
    expect(fillCalls.length).toBeGreaterThan(1);
  });
});

describe('ImageRenderer', () => {
  it('draws placeholder when image not loaded', () => {
    const ctx = createMockCtx();
    const el: ImageElement = {
      ...baseProps,
      type: 'image',
      src: 'https://example.com/img.png',
      w: 200,
      h: 150,
      naturalWidth: 400,
      naturalHeight: 300,
    };

    renderImage(ctx, el);

    // Should draw a dashed placeholder rect
    expect(ctx.calls).toContainEqual(expect.stringContaining('setLineDash('));
    expect(ctx.calls).toContainEqual(expect.stringContaining('strokeRect('));
  });
});

describe('StyleManager.parseColor', () => {
  it('parses 6-digit hex', () => {
    const c = parseColor('#ff8800');
    expect(c).toEqual({ r: 255, g: 136, b: 0, a: 1 });
  });

  it('parses 3-digit hex', () => {
    const c = parseColor('#f80');
    expect(c).toEqual({ r: 255, g: 136, b: 0, a: 1 });
  });

  it('parses 8-digit hex with alpha', () => {
    const c = parseColor('#ff880080');
    expect(c.a).toBeCloseTo(0.502, 2);
  });

  it('parses rgba()', () => {
    const c = parseColor('rgba(10, 20, 30, 0.5)');
    expect(c).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
  });

  it('parses rgb()', () => {
    const c = parseColor('rgb(10, 20, 30)');
    expect(c).toEqual({ r: 10, g: 20, b: 30, a: 1 });
  });
});
