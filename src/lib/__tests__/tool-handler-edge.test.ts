import { describe, it, expect, vi } from 'vitest';
import { handleToolCall, type ToolHandlerContext } from '@/lib/server/stream/tool-handler';

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
