/**
 * Tests for OpenAI draw tool parsing, schema validation, and error recovery.
 */

import { describe, test, expect } from 'vitest';
import {
  parseDrawToolCall,
  handleToolResult,
  tryParsePartialElements,
  DrawingError,
  withRetry,
  mapErrorToResponse,
} from '../streaming';
import { DrawToolArgsSchema, ELEMENT_TYPES, DRAW_OPERATIONS } from '../tools';

// ── Helpers ─────────────────────────────────────────────────────────

function validSpec(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    canvas: { width: 1920, height: 1080 },
    elements: [
      {
        id: 'rect-1',
        type: 'rectangle',
        x: 100,
        y: 200,
        width: 300,
        height: 150,
        style: { fill: '#3B82F6', stroke: '#1D4ED8', strokeWidth: 2 },
      },
    ],
    ...overrides,
  });
}

function multiElementSpec() {
  return JSON.stringify({
    canvas: { width: 1920, height: 1080 },
    elements: [
      { id: 'bg-1', type: 'rectangle', x: 0, y: 0, width: 1920, height: 1080, style: { fill: '#F8FAFC' } },
      { id: 'text-1', type: 'text', x: 100, y: 100, width: 200, height: 30, text: 'Hello' },
      { id: 'arrow-1', type: 'arrow', x: 0, y: 0, points: [[100, 100], [300, 300]] },
      { id: 'circle-1', type: 'ellipse', x: 400, y: 400, width: 100, height: 100 },
      { id: 'path-1', type: 'path', x: 0, y: 0, points: [[10, 10], [20, 30], [40, 20]] },
    ],
  });
}

// ── parseDrawToolCall ───────────────────────────────────────────────

describe('parseDrawToolCall', () => {
  test('parses valid spec successfully', () => {
    const result = parseDrawToolCall(validSpec());
    expect(result.elementCount).toBe(1);
    expect(result.elementIds).toEqual(['rect-1']);
    expect(result.args.canvas.width).toBe(1920);
  });

  test('parses multi-element spec', () => {
    const result = parseDrawToolCall(multiElementSpec());
    expect(result.elementCount).toBe(5);
    expect(result.elementIds).toContain('text-1');
    expect(result.elementIds).toContain('arrow-1');
  });

  test('handles all 8 element types', () => {
    const elements = ELEMENT_TYPES.map((type, i) => {
      const base: Record<string, unknown> = { id: `el-${i}`, type, x: i * 100, y: 0 };
      if (['line', 'arrow', 'path'].includes(type)) {
        base.points = [[0, 0], [100, 100]];
      }
      if (type === 'text') base.text = 'Test';
      if (type === 'group') base.children = [`el-0`];
      if (['rectangle', 'ellipse', 'image'].includes(type)) {
        base.width = 100;
        base.height = 100;
      }
      return base;
    });

    const spec = JSON.stringify({ canvas: { width: 1920, height: 1080 }, elements });
    const result = parseDrawToolCall(spec);
    expect(result.elementCount).toBe(8);
  });

  test('throws on invalid JSON', () => {
    expect(() => parseDrawToolCall('not json')).toThrow(DrawingError);
    expect(() => parseDrawToolCall('not json')).toThrow('Invalid JSON');
  });

  test('throws on missing canvas', () => {
    expect(() =>
      parseDrawToolCall(JSON.stringify({ elements: [] })),
    ).toThrow();
  });

  test('throws on missing elements', () => {
    expect(() =>
      parseDrawToolCall(JSON.stringify({ canvas: { width: 100, height: 100 } })),
    ).toThrow();
  });

  test('throws on duplicate element IDs', () => {
    const spec = JSON.stringify({
      canvas: { width: 1920, height: 1080 },
      elements: [
        { id: 'dup', type: 'rectangle', x: 0, y: 0 },
        { id: 'dup', type: 'rectangle', x: 100, y: 100 },
      ],
    });
    expect(() => parseDrawToolCall(spec)).toThrow('Duplicate element ID');
  });

  test('throws on oversized canvas', () => {
    const spec = JSON.stringify({
      canvas: { width: 10000, height: 10000 },
      elements: [{ id: 'r1', type: 'rectangle', x: 0, y: 0 }],
    });
    expect(() => parseDrawToolCall(spec)).toThrow('Canvas too large');
  });

  test('throws on out-of-bounds element', () => {
    const spec = JSON.stringify({
      canvas: { width: 1920, height: 1080 },
      elements: [{ id: 'r1', type: 'rectangle', x: 99999, y: 0 }],
    });
    expect(() => parseDrawToolCall(spec)).toThrow('out of bounds');
  });

  test('throws on line with < 2 points', () => {
    const spec = JSON.stringify({
      canvas: { width: 1920, height: 1080 },
      elements: [{ id: 'l1', type: 'line', x: 0, y: 0, points: [[0, 0]] }],
    });
    expect(() => parseDrawToolCall(spec)).toThrow('needs ≥2 points');
  });

  test('throws on text without content', () => {
    const spec = JSON.stringify({
      canvas: { width: 1920, height: 1080 },
      elements: [{ id: 't1', type: 'text', x: 0, y: 0 }],
    });
    expect(() => parseDrawToolCall(spec)).toThrow('no text content');
  });

  test('throws on group without children', () => {
    const spec = JSON.stringify({
      canvas: { width: 1920, height: 1080 },
      elements: [{ id: 'g1', type: 'group', x: 0, y: 0 }],
    });
    expect(() => parseDrawToolCall(spec)).toThrow('no children');
  });
});

// ── Zod schema validation ───────────────────────────────────────────

describe('DrawToolArgsSchema (Zod)', () => {
  test('accepts valid spec', () => {
    const result = DrawToolArgsSchema.safeParse({
      canvas: { width: 1920, height: 1080 },
      elements: [{ id: 'r1', type: 'rectangle', x: 0, y: 0 }],
    });
    expect(result.success).toBe(true);
  });

  test('rejects negative canvas dimensions', () => {
    const result = DrawToolArgsSchema.safeParse({
      canvas: { width: -100, height: 1080 },
      elements: [],
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid element type', () => {
    const result = DrawToolArgsSchema.safeParse({
      canvas: { width: 1920, height: 1080 },
      elements: [{ id: 'r1', type: 'invalid_type', x: 0, y: 0 }],
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing element id', () => {
    const result = DrawToolArgsSchema.safeParse({
      canvas: { width: 1920, height: 1080 },
      elements: [{ type: 'rectangle', x: 0, y: 0 }],
    });
    expect(result.success).toBe(false);
  });

  test('validates style opacity range', () => {
    const result = DrawToolArgsSchema.safeParse({
      canvas: { width: 1920, height: 1080 },
      elements: [{ id: 'r1', type: 'rectangle', x: 0, y: 0, style: { opacity: 1.5 } }],
    });
    expect(result.success).toBe(false);
  });

  test('accepts element with optional fields', () => {
    const result = DrawToolArgsSchema.safeParse({
      canvas: { width: 1920, height: 1080 },
      elements: [
        {
          id: 'r1',
          type: 'rectangle',
          x: 50,
          y: 50,
          width: 200,
          height: 100,
          rotation: 45,
          style: {
            fill: '#FF0000',
            stroke: '#000',
            strokeWidth: 2,
            borderRadius: 8,
            opacity: 0.8,
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ── handleToolResult ────────────────────────────────────────────────

describe('handleToolResult', () => {
  test('returns compact result with bbox', () => {
    const parsed = parseDrawToolCall(validSpec());
    const result = handleToolResult(parsed.args);

    expect(result.status).toBe('rendered');
    expect(result.elements_count).toBe(1);
    expect(result.bbox).toEqual({ x: 100, y: 200, w: 300, h: 150 });
    expect(result.last_ids).toEqual(['rect-1']);
  });

  test('computes bbox for multiple elements', () => {
    const parsed = parseDrawToolCall(multiElementSpec());
    const result = handleToolResult(parsed.args);

    expect(result.elements_count).toBe(5);
    expect(result.bbox.x).toBe(0);
    expect(result.bbox.y).toBe(0);
    expect(result.bbox.w).toBe(1920);
    expect(result.bbox.h).toBe(1080);
  });

  test('limits last_ids to 5', () => {
    const elements = Array.from({ length: 10 }, (_, i) => ({
      id: `el-${i}`,
      type: 'rectangle' as const,
      x: i * 10,
      y: 0,
      width: 10,
      height: 10,
    }));
    const spec = JSON.stringify({ canvas: { width: 1920, height: 1080 }, elements });
    const parsed = parseDrawToolCall(spec);
    const result = handleToolResult(parsed.args);

    expect(result.last_ids).toHaveLength(5);
    expect(result.last_ids[0]).toBe('el-5');
  });
});

// ── tryParsePartialElements ─────────────────────────────────────────

describe('tryParsePartialElements', () => {
  test('extracts complete elements from partial buffer', () => {
    const buffer = '{"canvas":{"width":1920,"height":1080},"elements":[{"id":"r1","type":"rectangle","x":0,"y":0},{"id":"r2","type":"elli';
    const result = tryParsePartialElements(buffer);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe('r1');
  });

  test('returns null for empty buffer', () => {
    expect(tryParsePartialElements('')).toBeNull();
  });

  test('returns null when no elements key found', () => {
    expect(tryParsePartialElements('{"canvas":{"width":192')).toBeNull();
  });

  test('extracts multiple complete elements', () => {
    const buffer = '{"canvas":{"width":1920,"height":1080},"elements":[{"id":"r1","type":"rectangle","x":0,"y":0},{"id":"t1","type":"text","x":100,"y":100,"text":"Hi"}]}';
    const result = tryParsePartialElements(buffer);

    expect(result).toHaveLength(2);
    expect(result![0].id).toBe('r1');
    expect(result![1].id).toBe('t1');
  });
});

// ── Error recovery & retry ──────────────────────────────────────────

describe('withRetry', () => {
  test('succeeds on first try', async () => {
    const result = await withRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  test('retries on retryable error and succeeds', async () => {
    let attempt = 0;
    const result = await withRetry(
      () => {
        attempt++;
        if (attempt < 2) throw new Error('rate limit exceeded (429)');
        return Promise.resolve('ok');
      },
      { maxAttempts: 3, baseDelayMs: 10 },
    );
    expect(result).toBe('ok');
    expect(attempt).toBe(2);
  });

  test('throws immediately on non-retryable error', async () => {
    await expect(
      withRetry(
        () => { throw new DrawingError('Bad request', false, 'BAD_REQUEST'); },
        { maxAttempts: 3, baseDelayMs: 10 },
      ),
    ).rejects.toThrow('Bad request');
  });

  test('exhausts all attempts on persistent retryable error', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        () => { attempts++; throw new Error('500 Internal Server Error'); },
        { maxAttempts: 2, baseDelayMs: 10 },
      ),
    ).rejects.toThrow('Exhausted');
    expect(attempts).toBe(2);
  });
});

// ── Error mapping ───────────────────────────────────────────────────

describe('mapErrorToResponse', () => {
  test('maps rate limit error', () => {
    const result = mapErrorToResponse(new Error('Rate limit exceeded (429)'));
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.retryable).toBe(true);
  });

  test('maps timeout error', () => {
    const result = mapErrorToResponse(new Error('Request timed out'));
    expect(result.code).toBe('TIMEOUT');
    expect(result.retryable).toBe(true);
  });

  test('maps server error', () => {
    const result = mapErrorToResponse(new Error('502 Bad Gateway'));
    expect(result.code).toBe('SERVER_ERROR');
    expect(result.retryable).toBe(true);
  });

  test('maps DrawingError with code', () => {
    const result = mapErrorToResponse(new DrawingError('bad spec', true, 'INVALID_SPEC'));
    expect(result.code).toBe('INVALID_SPEC');
    expect(result.retryable).toBe(true);
  });

  test('maps unknown error as BAD_REQUEST', () => {
    const result = mapErrorToResponse(new Error('something unknown'));
    expect(result.code).toBe('BAD_REQUEST');
    expect(result.retryable).toBe(false);
  });
});

// ── Constants ───────────────────────────────────────────────────────

describe('tool constants', () => {
  test('ELEMENT_TYPES has 8 types', () => {
    expect(ELEMENT_TYPES).toHaveLength(8);
    expect(ELEMENT_TYPES).toContain('rectangle');
    expect(ELEMENT_TYPES).toContain('group');
    expect(ELEMENT_TYPES).toContain('path');
  });

  test('DRAW_OPERATIONS has 11 operations', () => {
    expect(DRAW_OPERATIONS).toHaveLength(11);
    expect(DRAW_OPERATIONS).toContain('erase');
    expect(DRAW_OPERATIONS).toContain('move');
    expect(DRAW_OPERATIONS).toContain('undo');
  });
});
