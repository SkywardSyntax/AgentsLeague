/**
 * Tests for DrawToolLoop — iteration cap, validation, compact results,
 * context sliding window, and state transitions.
 */

import { describe, test, expect } from 'vitest';
import type { DrawElement, DrawOp } from '@/types';
import {
  DrawToolLoop,
  DrawToolLoopError,
  MAX_ITERATIONS,
  StateManager,
  validateOps,
  type WhiteboardStore,
} from '../DrawToolLoop';
import { ContextManager, estimateTokens } from '../ContextManager';
import { buildToolResult } from '../ToolResultBuilder';

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

function makeStore(initial: DrawElement[] = []): WhiteboardStore {
  const elements = new Map<string, DrawElement>(
    initial.map((el) => [el.id, el]),
  );
  return {
    getElements: () => elements,
    applyOps: (ops: DrawOp[]) => {
      for (const op of ops) {
        switch (op.op) {
          case 'add':
            elements.set(op.element.id, op.element);
            break;
          case 'update': {
            const existing = elements.get(op.id);
            if (existing) {
              elements.set(op.id, { ...existing, ...op.patch } as DrawElement);
            }
            break;
          }
          case 'delete':
            elements.delete(op.id);
            break;
          case 'clear':
            elements.clear();
            break;
        }
      }
    },
  };
}

// ── StateManager ────────────────────────────────────────────────────

describe('StateManager', () => {
  test('starts in IDLE', () => {
    const sm = new StateManager();
    expect(sm.status).toBe('IDLE');
  });

  test('allows IDLE → PROCESSING → DRAWING → IDLE', () => {
    const sm = new StateManager();
    sm.transition('PROCESSING');
    expect(sm.status).toBe('PROCESSING');
    sm.transition('DRAWING');
    expect(sm.status).toBe('DRAWING');
    sm.transition('IDLE');
    expect(sm.status).toBe('IDLE');
  });

  test('allows DRAWING → PROCESSING loopback', () => {
    const sm = new StateManager();
    sm.transition('PROCESSING');
    sm.transition('DRAWING');
    sm.transition('PROCESSING');
    expect(sm.status).toBe('PROCESSING');
  });

  test('throws on illegal transition IDLE → DRAWING', () => {
    const sm = new StateManager();
    expect(() => sm.transition('DRAWING')).toThrow('Illegal transition');
  });

  test('throws on illegal transition IDLE → IDLE', () => {
    const sm = new StateManager();
    expect(() => sm.transition('IDLE')).toThrow('Illegal transition');
  });

  test('reset returns to IDLE', () => {
    const sm = new StateManager();
    sm.transition('PROCESSING');
    sm.reset();
    expect(sm.status).toBe('IDLE');
  });
});

// ── Iteration cap ───────────────────────────────────────────────────

describe('DrawToolLoop iteration cap', () => {
  test(`MAX_ITERATIONS is ${MAX_ITERATIONS}`, () => {
    expect(MAX_ITERATIONS).toBe(15);
  });

  test('forces finish after max iterations', () => {
    const loop = new DrawToolLoop();
    const store = makeStore();
    loop.begin();

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const ops: DrawOp[] = [{ op: 'add', element: makeRect(`r${i}`) }];
      loop.executeDrawOps(ops, store);
      const result = loop.continueOrFinish(false);
      if (i < MAX_ITERATIONS - 1) {
        expect(result).toBe('continue');
      } else {
        expect(result).toBe('finish');
      }
    }

    expect(loop.state.status).toBe('IDLE');
  });

  test('done:true finishes early', () => {
    const loop = new DrawToolLoop();
    const store = makeStore();
    loop.begin();

    loop.executeDrawOps([{ op: 'add', element: makeRect('r0') }], store);
    const result = loop.continueOrFinish(true);

    expect(result).toBe('finish');
    expect(loop.state.status).toBe('IDLE');
    expect(loop.getIteration()).toBe(1);
  });
});

// ── Validation ──────────────────────────────────────────────────────

describe('validateOps', () => {
  test('rejects duplicate add IDs', () => {
    const ops: DrawOp[] = [
      { op: 'add', element: makeRect('r1') },
      { op: 'add', element: makeRect('r1') },
    ];
    const { valid, errors } = validateOps(ops, new Set());
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.reason).toContain('Duplicate');
  });

  test('rejects add with existing ID', () => {
    const ops: DrawOp[] = [{ op: 'add', element: makeRect('existing') }];
    const { valid, errors } = validateOps(ops, new Set(['existing']));
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  test('rejects out-of-bounds elements', () => {
    const ops: DrawOp[] = [
      { op: 'add', element: makeRect('r1', 999999, 999999) },
    ];
    const { valid, errors } = validateOps(ops, new Set());
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.reason).toContain('Out of bounds');
  });

  test('rejects update for unknown element', () => {
    const ops: DrawOp[] = [
      { op: 'update', id: 'nonexistent', patch: { x: 5 } },
    ];
    const { valid, errors } = validateOps(ops, new Set());
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  test('rejects delete for unknown element', () => {
    const ops: DrawOp[] = [{ op: 'delete', id: 'nonexistent' }];
    const { valid, errors } = validateOps(ops, new Set());
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  test('executeDrawOps throws when all ops invalid', () => {
    const loop = new DrawToolLoop();
    const store = makeStore();
    loop.begin();

    const ops: DrawOp[] = [
      { op: 'update', id: 'nonexistent', patch: { x: 5 } },
    ];
    expect(() => loop.executeDrawOps(ops, store)).toThrow(DrawToolLoopError);
  });
});

// ── Compact tool result ─────────────────────────────────────────────

describe('compact tool result', () => {
  test('buildToolResult returns correct structure', () => {
    const elements = [makeRect('r1'), makeRect('r2')];
    const result = buildToolResult(elements, 2);

    expect(result.elements_count).toBe(2);
    expect(result.last_ids).toEqual(['r1', 'r2']);
    expect(result.bbox).not.toBeNull();
    expect(result.summary).toContain('2 ops');
    expect(result.summary).toContain('rect');
  });

  test('buildToolResult caps last_ids at 5', () => {
    const elements = Array.from({ length: 10 }, (_, i) =>
      makeRect(`r${i}`),
    );
    const result = buildToolResult(elements, 10);
    expect(result.last_ids).toHaveLength(5);
    expect(result.last_ids[0]).toBe('r5');
  });

  test('buildToolResult returns null bbox for empty elements', () => {
    const result = buildToolResult([], 0);
    expect(result.bbox).toBeNull();
    expect(result.elements_count).toBe(0);
  });

  test('executeDrawOps returns compact result', () => {
    const loop = new DrawToolLoop();
    const store = makeStore();
    loop.begin();

    const ops: DrawOp[] = [
      { op: 'add', element: makeRect('r1') },
      { op: 'add', element: makeRect('r2', 200, 300) },
    ];
    const result = loop.executeDrawOps(ops, store);

    expect(result.elements_count).toBe(2);
    expect(result.last_ids).toContain('r1');
    expect(result.last_ids).toContain('r2');
    expect(result.bbox).not.toBeNull();
  });
});

// ── Context sliding window ──────────────────────────────────────────

describe('ContextManager sliding window', () => {
  test('tracks token count', () => {
    const ctx = new ContextManager();
    ctx.addTurn({ role: 'user', content: 'hello' });
    expect(ctx.getTotalTokens()).toBeGreaterThan(0);
  });

  test('estimateTokens approximation', () => {
    const tokens = estimateTokens('Hello world, this is a test.');
    // ~28 chars / 4 = 7 tokens
    expect(tokens).toBeGreaterThanOrEqual(5);
    expect(tokens).toBeLessThanOrEqual(10);
  });

  test('compacts when exceeding threshold', () => {
    const ctx = new ContextManager(200, 100);
    // Add enough turns to exceed compaction threshold
    for (let i = 0; i < 20; i++) {
      ctx.addTurn({ role: 'user', content: `Turn ${i}: ${'x'.repeat(40)}` });
    }
    // Should have compacted — fewer turns than added
    expect(ctx.getTurns().length).toBeLessThan(20);
    expect(ctx.getTotalTokens()).toBeLessThanOrEqual(200);
  });

  test('stays under max tokens after many turns', () => {
    const ctx = new ContextManager(500, 300);
    for (let i = 0; i < 100; i++) {
      ctx.addTurn({
        role: 'user',
        content: `Message ${i}: ${'lorem ipsum '.repeat(5)}`,
      });
    }
    expect(ctx.getTotalTokens()).toBeLessThanOrEqual(500);
  });

  test('compactToolCalls replaces N turns with summary', () => {
    const ctx = new ContextManager();
    ctx.addTurn({ role: 'tool', content: 'tool call 1 result data' });
    ctx.addTurn({ role: 'tool', content: 'tool call 2 result data' });
    ctx.addTurn({ role: 'tool', content: 'tool call 3 result data' });
    ctx.addTurn({ role: 'user', content: 'next step' });

    ctx.compactToolCalls(0, 3, 'Drew 3 shapes');

    const turns = ctx.getTurns();
    expect(turns).toHaveLength(2); // 1 compacted + 1 user
    expect(turns[0]!.content).toContain('Compacted 3 tool calls');
  });

  test('injectCanvasState adds system turn', () => {
    const ctx = new ContextManager();
    const elements = [makeRect('r1'), makeRect('r2')];
    ctx.injectCanvasState(elements);

    const turns = ctx.getTurns();
    expect(turns).toHaveLength(1);
    expect(turns[0]!.role).toBe('system');
    expect(turns[0]!.content).toContain('2 elements');
  });

  test('reset clears all state', () => {
    const ctx = new ContextManager();
    ctx.addTurn({ role: 'user', content: 'hello' });
    ctx.reset();
    expect(ctx.getTurns()).toHaveLength(0);
    expect(ctx.getTotalTokens()).toBe(0);
  });
});

// ── Full loop integration ───────────────────────────────────────────

describe('DrawToolLoop full cycle', () => {
  test('IDLE → PROCESSING → DRAWING → IDLE with context', () => {
    const loop = new DrawToolLoop();
    const store = makeStore();

    // User message
    loop.context.addTurn({ role: 'user', content: 'Draw a rectangle' });

    // Begin processing
    loop.begin();
    expect(loop.state.status).toBe('PROCESSING');

    // Execute draw ops
    const result = loop.executeDrawOps(
      [{ op: 'add', element: makeRect('r1') }],
      store,
    );
    expect(loop.state.status).toBe('DRAWING');
    expect(result.elements_count).toBe(1);

    // Feed back result, done
    loop.context.addTurn({
      role: 'tool',
      content: JSON.stringify(result),
    });

    loop.continueOrFinish(true);
    expect(loop.state.status).toBe('IDLE');
  });

  test('multi-step loop: DRAWING → PROCESSING → DRAWING → IDLE', () => {
    const loop = new DrawToolLoop();
    const store = makeStore();
    loop.begin();

    // Step 1
    loop.executeDrawOps(
      [{ op: 'add', element: makeRect('r1') }],
      store,
    );
    const step1 = loop.continueOrFinish(false);
    expect(step1).toBe('continue');
    expect(loop.state.status).toBe('PROCESSING');

    // Step 2
    loop.executeDrawOps(
      [{ op: 'add', element: makeRect('r2', 200, 200) }],
      store,
    );
    const step2 = loop.continueOrFinish(true);
    expect(step2).toBe('finish');
    expect(loop.state.status).toBe('IDLE');
    expect(loop.getIteration()).toBe(2);
  });
});
