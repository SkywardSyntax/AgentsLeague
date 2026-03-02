import { describe, it, expect, vi } from 'vitest';
import { handleToolCall, type ToolHandlerContext } from '@/lib/server/stream/tool-handler';
import { extendStructuredWhiteboardContext } from '@/lib/whiteboard/planner';
import type { DrawBatch } from '@/types/agent';

function makeCtx(overrides?: Partial<ToolHandlerContext>): ToolHandlerContext {
  return {
    send: vi.fn(),
    turnId: 'turn-1',
    turnContextV2: undefined,
    plannerMode: 'semantic_preferred',
    log: { warn: vi.fn() },
    ...overrides,
  };
}

describe('handleToolCall edge cases', () => {
  it('returns null for unknown tool name', () => {
    const ctx = makeCtx();
    const result = handleToolCall('nonexistent_tool', {}, ctx);
    expect(result).toBeNull();
  });

  it('logs warning with tool name for unknown tool', () => {
    const ctx = makeCtx();
    handleToolCall('hallucinated_function', {}, ctx);
    expect(ctx.log.warn).toHaveBeenCalledWith('unknown_tool_call', {
      name: 'hallucinated_function',
      turnId: 'turn-1',
    });
  });

  it('returns null for empty string tool name', () => {
    const ctx = makeCtx();
    const result = handleToolCall('', {}, ctx);
    expect(result).toBeNull();
  });

  it('truncates long tool names in log to prevent log injection', () => {
    const ctx = makeCtx();
    const longName = 'a'.repeat(200);
    handleToolCall(longName, {}, ctx);
    expect(ctx.log.warn).toHaveBeenCalledWith('unknown_tool_call', {
      name: 'a'.repeat(120),
      turnId: 'turn-1',
    });
  });

  it('does not log parsedArgs to avoid leaking sensitive data', () => {
    const ctx = makeCtx();
    const sensitiveArgs = { password: 'secret123', apiKey: 'sk-xxx' };
    handleToolCall('unknown_tool', sensitiveArgs, ctx);
    const callArgs = (ctx.log.warn as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('parsedArgs');
    expect(callArgs).not.toHaveProperty('password');
    expect(callArgs).not.toHaveProperty('apiKey');
    expect(JSON.stringify(callArgs)).not.toContain('secret123');
  });
});

describe('suggested_next_regions safety (10A verification)', () => {
  const minimalBatch: DrawBatch = {
    batch_id: 'test-batch',
    elements: [
      { id: 'el-1', type: 'text', x: 100, y: 100, text: 'hello', size: 16 },
    ],
  };

  it('extendStructuredWhiteboardContext returns non-empty suggested_next_regions when context is undefined', () => {
    const result = extendStructuredWhiteboardContext(undefined, minimalBatch);
    expect(result.suggested_next_regions).toBeDefined();
    expect(result.suggested_next_regions.length).toBeGreaterThan(0);
    expect(result.suggested_next_regions[0]).toHaveProperty('x');
    expect(result.suggested_next_regions[0]).toHaveProperty('y');
  });

  it('extendStructuredWhiteboardContext returns non-empty suggested_next_regions with existing context', () => {
    const existing = extendStructuredWhiteboardContext(undefined, minimalBatch);
    const result = extendStructuredWhiteboardContext(existing, {
      batch_id: 'batch-2',
      elements: [{ id: 'el-2', type: 'text', x: 200, y: 200, text: 'world', size: 16 }],
    });
    expect(result.suggested_next_regions.length).toBeGreaterThan(0);
    expect(result.suggested_next_regions[0]).toHaveProperty('x');
    expect(result.suggested_next_regions[0]).toHaveProperty('y');
  });

  it('extendStructuredWhiteboardContext returns non-empty suggested_next_regions after clear element', () => {
    const result = extendStructuredWhiteboardContext(undefined, {
      batch_id: 'clear-batch',
      elements: [{ id: 'clr', type: 'clear' }],
    });
    expect(result.suggested_next_regions.length).toBeGreaterThan(0);
  });

  it('suggested_next_regions[0] ternary guard produces valid origin or undefined', () => {
    const result = extendStructuredWhiteboardContext(undefined, minimalBatch);
    const suggested = result.suggested_next_regions[0];
    const origin = suggested ? { x: suggested.x, y: suggested.y } : undefined;
    expect(origin).toBeDefined();
    expect(typeof origin!.x).toBe('number');
    expect(typeof origin!.y).toBe('number');
  });
});

describe('handleToolCall with known tools and edge inputs', () => {
  it('emit_draw_batch with empty parsedArgs sends warning and does not crash', () => {
    const ctx = makeCtx();
    const result = handleToolCall('emit_draw_batch', {}, ctx);
    expect(result).not.toBeNull();
    expect(result!.sawToolBatch).toBe(false);
    expect(ctx.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', code: 'INVALID_DRAW_BATCH' }),
    );
  });

  it('emit_semantic_batch with empty parsedArgs sends warning and does not crash', () => {
    const ctx = makeCtx();
    const result = handleToolCall('emit_semantic_batch', {}, ctx);
    expect(result).not.toBeNull();
    expect(result!.sawToolBatch).toBe(false);
    expect(ctx.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', code: 'INVALID_SEMANTIC_BATCH' }),
    );
  });

  it('very long tool name (1000 chars) is truncated to 120 in log', () => {
    const ctx = makeCtx();
    const longName = 'z'.repeat(1000);
    handleToolCall(longName, {}, ctx);
    expect(ctx.log.warn).toHaveBeenCalledWith('unknown_tool_call', {
      name: 'z'.repeat(120),
      turnId: 'turn-1',
    });
  });

  it('emit_draw_batch with many invalid elements produces warnings without crash', () => {
    const ctx = makeCtx();
    const manyBadElements = Array.from({ length: 50 }, (_, i) => ({
      id: `bad-${i}`,
      type: 'rect',
      x: 0,
      y: 0,
    }));
    const result = handleToolCall(
      'emit_draw_batch',
      { batch_id: 'flood-test', elements: manyBadElements },
      ctx,
    );
    expect(result).not.toBeNull();
    // All invalid rects (missing w/h) → batch should fail or be empty
    expect(result!.sawToolBatch).toBe(false);
  });
});
