import { describe, it, expect } from 'vitest';

// Re-implement the extraction logic from route.ts to test in isolation
// without importing the entire route module (which depends on server env)

interface FunctionCall {
  callId: string;
  name: string;
  arguments: string;
}

function parseFunctionCallFromEvent(
  event: { type: string; [key: string]: unknown },
): FunctionCall | null {
  if (event.type === 'response.function_call_arguments.done') {
    const runtimeCallId =
      'call_id' in event && typeof event.call_id === 'string'
        ? event.call_id
        : undefined;
    const itemId =
      'item_id' in event && typeof event.item_id === 'string'
        ? event.item_id
        : undefined;
    const callId = runtimeCallId ?? itemId;
    const name = typeof event.name === 'string' ? event.name : undefined;
    const args = typeof event.arguments === 'string' ? event.arguments : undefined;
    if (callId && name && args !== undefined) {
      return { callId, name, arguments: args };
    }
  }

  if (event.type === 'response.output_item.done') {
    const item = event.item;
    if (
      typeof item === 'object' &&
      item !== null &&
      'type' in item &&
      (item as Record<string, unknown>).type === 'function_call'
    ) {
      const fc = item as Record<string, unknown>;
      const callId = typeof fc.call_id === 'string' ? fc.call_id : undefined;
      const name = typeof fc.name === 'string' ? fc.name : undefined;
      const args = typeof fc.arguments === 'string' ? fc.arguments : undefined;
      if (callId && name && args !== undefined) {
        return { callId, name, arguments: args };
      }
    }
  }

  return null;
}

describe('parseFunctionCallFromEvent', () => {
  it('extracts from function_call_arguments.done with call_id', () => {
    const result = parseFunctionCallFromEvent({
      type: 'response.function_call_arguments.done',
      call_id: 'call_1',
      item_id: 'item_1',
      name: 'emit_draw_batch',
      arguments: '{"elements":[]}',
    });
    expect(result).toEqual({
      callId: 'call_1',
      name: 'emit_draw_batch',
      arguments: '{"elements":[]}',
    });
  });

  it('falls back to item_id when call_id is missing', () => {
    const result = parseFunctionCallFromEvent({
      type: 'response.function_call_arguments.done',
      item_id: 'item_2',
      name: 'emit_draw_batch',
      arguments: '{}',
    });
    expect(result).toEqual({
      callId: 'item_2',
      name: 'emit_draw_batch',
      arguments: '{}',
    });
  });

  it('returns null when name is missing', () => {
    const result = parseFunctionCallFromEvent({
      type: 'response.function_call_arguments.done',
      call_id: 'call_1',
      arguments: '{}',
    });
    expect(result).toBeNull();
  });

  it('returns null when arguments is not a string', () => {
    const result = parseFunctionCallFromEvent({
      type: 'response.function_call_arguments.done',
      call_id: 'call_1',
      name: 'emit_draw_batch',
      arguments: 42,
    });
    expect(result).toBeNull();
  });

  it('extracts from output_item.done with function_call item', () => {
    const result = parseFunctionCallFromEvent({
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        call_id: 'call_3',
        name: 'emit_semantic_batch',
        arguments: '{"intent":"test"}',
      },
    });
    expect(result).toEqual({
      callId: 'call_3',
      name: 'emit_semantic_batch',
      arguments: '{"intent":"test"}',
    });
  });

  it('returns null for output_item.done with non-function_call item', () => {
    const result = parseFunctionCallFromEvent({
      type: 'response.output_item.done',
      item: { type: 'message', content: 'hello' },
    });
    expect(result).toBeNull();
  });

  it('returns null for output_item.done with item missing call_id', () => {
    const result = parseFunctionCallFromEvent({
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        name: 'emit_draw_batch',
        arguments: '{}',
      },
    });
    expect(result).toBeNull();
  });

  it('returns null for output_item.done when item is a string', () => {
    const result = parseFunctionCallFromEvent({
      type: 'response.output_item.done',
      item: 'not-an-object',
    });
    expect(result).toBeNull();
  });

  it('returns null for output_item.done with partial nested item (arguments is number)', () => {
    const result = parseFunctionCallFromEvent({
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        call_id: 'call_4',
        name: 'emit_draw_batch',
        arguments: 5,
      },
    });
    expect(result).toBeNull();
  });

  it('returns null for unrelated event types', () => {
    const result = parseFunctionCallFromEvent({
      type: 'response.text.delta',
      delta: 'hello',
    });
    expect(result).toBeNull();
  });
});
