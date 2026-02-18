/**
 * Integration tests for OpenAI tool loop with mock client.
 *
 * Validates the full cycle: IDLE → PROCESSING → DRAWING → IDLE
 * with tool call parsing, validation, and context management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DrawToolLoop,
  DrawToolLoopError,
  MAX_ITERATIONS,
  StateManager,
  validateOps,
} from '@/lib/tool-workflow/DrawToolLoop';
import { ContextManager } from '@/lib/tool-workflow/ContextManager';
import { parseDrawToolCall, handleToolResult, tryParsePartialElements } from '@/lib/openai/streaming';
import { createMockOpenAIClient, createMockWhiteboardStore } from '@/lib/test-utils';
import type { DrawElement, DrawOp } from '@/types';

// ── Helpers ─────────────────────────────────────────────────────────

function makeRect(id: string, x = 10, y = 20): DrawElement {
  return {
    id,
    type: 'rect',
    x,
    y,
    w: 100,
    h: 60,
    rotation: 0,
    opacity: 1,
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cornerRadius: 8,
    fill: { type: 'solid', color: '#4A90D9', opacity: 1 },
    stroke: { color: '#2C3E50', width: 2, lineCap: 'round', lineJoin: 'round' },
  } as DrawElement;
}

// ── Mock OpenAI Client Integration ──────────────────────────────────

describe('OpenAI mock client integration', () => {
  it('creates a streaming async iterator', async () => {
    const client = createMockOpenAIClient();
    const stream = await client.responses.create({
      model: 'gpt-4o',
      input: 'Draw a rectangle',
      tools: [],
    });

    const events: Array<{ type: string }> = [];
    for await (const event of stream) {
      events.push(event as { type: string });
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]!.type).toBe('response.completed');
  });

  it('receives function call arguments via delta events', async () => {
    const client = createMockOpenAIClient();
    const stream = await client.responses.create({
      model: 'gpt-4o',
      input: 'Draw a rectangle',
      tools: [],
    });

    let argBuffer = '';
    for await (const event of stream) {
      const e = event as { type: string; delta?: string };
      if (e.type === 'response.function_call_arguments.delta') {
        argBuffer += e.delta ?? '';
      }
    }

    expect(argBuffer.length).toBeGreaterThan(0);
    // The full args buffer should be parseable
    const parsed = JSON.parse(argBuffer);
    expect(parsed.canvas).toBeDefined();
    expect(parsed.elements).toBeInstanceOf(Array);
  });

  it('parseDrawToolCall validates arguments from mock stream', async () => {
    const client = createMockOpenAIClient();
    const stream = await client.responses.create({
      model: 'gpt-4o',
      input: 'Draw a rectangle',
      tools: [],
    });

    let fullArgs = '';
    for await (const event of stream) {
      const e = event as { type: string; arguments?: string };
      if (e.type === 'response.function_call_arguments.done') {
        fullArgs = e.arguments ?? '';
      }
    }

    const result = parseDrawToolCall(fullArgs);
    expect(result.elementCount).toBe(1);
    expect(result.elementIds).toContain('rect-1');
  });
});

// ── Tool Loop with Mock Client ──────────────────────────────────────

describe('Tool loop with mock client', () => {
  let loop: DrawToolLoop;

  beforeEach(() => {
    loop = new DrawToolLoop();
  });

  it('full cycle: begin → executeDrawOps → finish', () => {
    const store = createMockWhiteboardStore();
    loop.begin();
    expect(loop.state.status).toBe('PROCESSING');

    const ops: DrawOp[] = [{ op: 'add', element: makeRect('r1') }];
    const result = loop.executeDrawOps(ops, store);

    expect(loop.state.status).toBe('DRAWING');
    expect(result.elements_count).toBe(1);

    loop.continueOrFinish(true);
    expect(loop.state.status).toBe('IDLE');
  });

  it('multi-turn loop with context management', () => {
    const store = createMockWhiteboardStore();
    loop.context.addTurn({ role: 'user', content: 'Draw a diagram' });

    loop.begin();

    // Turn 1: Draw shapes
    const ops1: DrawOp[] = [
      { op: 'add', element: makeRect('r1') },
      { op: 'add', element: makeRect('r2', 200, 200) },
    ];
    const result1 = loop.executeDrawOps(ops1, store);
    loop.context.addTurn({ role: 'tool', content: JSON.stringify(result1) });

    const decision1 = loop.continueOrFinish(false);
    expect(decision1).toBe('continue');
    expect(loop.state.status).toBe('PROCESSING');

    // Turn 2: Add labels
    const textElement: DrawElement = {
      id: 'text-1',
      type: 'text',
      x: 50,
      y: 50,
      rotation: 0,
      opacity: 1,
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      content: 'Server',
      w: 100,
      h: 20,
      style: {
        fontFamily: 'Inter',
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 1.4,
        letterSpacing: 0,
        color: '#000000',
        align: 'left',
      },
    } as DrawElement;

    const ops2: DrawOp[] = [{ op: 'add', element: textElement }];
    const result2 = loop.executeDrawOps(ops2, store);
    loop.context.addTurn({ role: 'tool', content: JSON.stringify(result2) });

    const decision2 = loop.continueOrFinish(true);
    expect(decision2).toBe('finish');
    expect(loop.state.status).toBe('IDLE');
    expect(loop.getIteration()).toBe(2);

    // Verify canvas state
    expect(store.getElements().size).toBe(3);
    expect(store.getElements().has('r1')).toBe(true);
    expect(store.getElements().has('text-1')).toBe(true);
  });

  it('handleToolResult builds compact result from args', () => {
    const args = {
      canvas: { width: 1920, height: 1080 },
      elements: [
        { id: 'rect-1', type: 'rectangle' as const, x: 100, y: 200, width: 300, height: 150 },
        { id: 'text-1', type: 'text' as const, x: 50, y: 50, text: 'Hello' },
      ],
    };

    const result = handleToolResult(args);
    expect(result.status).toBe('rendered');
    expect(result.elements_count).toBe(2);
    expect(result.last_ids).toContain('rect-1');
    expect(result.bbox.w).toBeGreaterThan(0);
  });

  it('rejects all-invalid ops with DrawToolLoopError', () => {
    const store = createMockWhiteboardStore();
    loop.begin();

    const ops: DrawOp[] = [
      { op: 'update', id: 'nonexistent', patch: { x: 5 } },
    ];

    expect(() => loop.executeDrawOps(ops, store)).toThrow(DrawToolLoopError);
  });

  it('partial JSON parsing extracts streamed elements', () => {
    const buffer = '{"canvas":{"width":1920,"height":1080},"elements":[{"id":"r1","type":"rectangle","x":0,"y":0},{"id":"r2","type":"elli';
    const elements = tryParsePartialElements(buffer);

    expect(elements).not.toBeNull();
    expect(elements).toHaveLength(1);
    expect(elements![0]!.id).toBe('r1');
  });

  it('enforces max iteration cap', () => {
    const store = createMockWhiteboardStore();
    loop.begin();

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      loop.executeDrawOps([{ op: 'add', element: makeRect(`r${i}`) }], store);
      const result = loop.continueOrFinish(false);

      if (i === MAX_ITERATIONS - 1) {
        expect(result).toBe('finish');
      } else {
        expect(result).toBe('continue');
      }
    }

    expect(loop.state.status).toBe('IDLE');
  });
});

// ── Streaming partial element extraction ────────────────────────────

describe('Streaming partial element extraction', () => {
  it('extracts multiple complete elements from partial buffer', () => {
    const buffer = '{"canvas":{"width":1920,"height":1080},"elements":[{"id":"r1","type":"rectangle","x":0,"y":0},{"id":"t1","type":"text","x":100,"y":100,"text":"Hi"}]}';
    const elements = tryParsePartialElements(buffer);

    expect(elements).toHaveLength(2);
    expect(elements![0]!.id).toBe('r1');
    expect(elements![1]!.id).toBe('t1');
  });

  it('returns null for empty buffer', () => {
    expect(tryParsePartialElements('')).toBeNull();
  });

  it('returns null when no elements key found', () => {
    expect(tryParsePartialElements('{"canvas":{"width":192')).toBeNull();
  });
});
