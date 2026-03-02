import { describe, it, expect } from 'vitest';
import { prop, parseFunctionCallFromEvent } from '@/lib/server/stream/event-parser';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';

describe('prop', () => {
  it('returns property value from an object', () => {
    expect(prop({ foo: 'bar' }, 'foo')).toBe('bar');
  });

  it('returns undefined for a missing property', () => {
    expect(prop({ foo: 'bar' }, 'baz')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(prop(null, 'foo')).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(prop(undefined, 'foo')).toBeUndefined();
  });

  it('returns undefined for number primitive', () => {
    expect(prop(42, 'toString')).toBeUndefined();
  });

  it('returns undefined for string primitive', () => {
    expect(prop('hello', 'length')).toBeUndefined();
  });

  it('returns undefined for boolean primitive', () => {
    expect(prop(true, 'valueOf')).toBeUndefined();
  });

  it('supports nested access via composition', () => {
    const obj = { item: { call_id: 'abc' } };
    expect(prop(prop(obj, 'item'), 'call_id')).toBe('abc');
  });

  it('returns undefined for nested access on missing intermediate', () => {
    const obj = { other: 'val' };
    expect(prop(prop(obj, 'item'), 'call_id')).toBeUndefined();
  });

  it('handles falsy property values correctly', () => {
    expect(prop({ count: 0 }, 'count')).toBe(0);
    expect(prop({ flag: false }, 'flag')).toBe(false);
    expect(prop({ val: '' }, 'val')).toBe('');
    expect(prop({ n: null }, 'n')).toBeNull();
  });
});

describe('parseFunctionCallFromEvent', () => {
  it('parses function_call_arguments.done with top-level fields', () => {
    const event = {
      type: 'response.function_call_arguments.done',
      call_id: 'call-1',
      name: 'emit_draw_batch',
      arguments: '{"elements":[]}',
    } as unknown as ResponseStreamEvent;

    expect(parseFunctionCallFromEvent(event)).toEqual({
      callId: 'call-1',
      name: 'emit_draw_batch',
      arguments: '{"elements":[]}',
    });
  });

  it('parses function_call_arguments.done with nested item fields', () => {
    const event = {
      type: 'response.function_call_arguments.done',
      item: {
        call_id: 'call-2',
        name: 'emit_semantic_batch',
        arguments: '{}',
      },
    } as unknown as ResponseStreamEvent;

    expect(parseFunctionCallFromEvent(event)).toEqual({
      callId: 'call-2',
      name: 'emit_semantic_batch',
      arguments: '{}',
    });
  });

  it('prefers top-level fields over nested item fields', () => {
    const event = {
      type: 'response.function_call_arguments.done',
      call_id: 'top-call',
      name: 'top-name',
      arguments: '{"top":true}',
      item: {
        call_id: 'nested-call',
        name: 'nested-name',
        arguments: '{"nested":true}',
      },
    } as unknown as ResponseStreamEvent;

    expect(parseFunctionCallFromEvent(event)).toEqual({
      callId: 'top-call',
      name: 'top-name',
      arguments: '{"top":true}',
    });
  });

  it('parses response.output_item.done with function_call item', () => {
    const event = {
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        call_id: 'call-3',
        name: 'emit_graph_script',
        arguments: '{"script":""}',
      },
    } as unknown as ResponseStreamEvent;

    expect(parseFunctionCallFromEvent(event)).toEqual({
      callId: 'call-3',
      name: 'emit_graph_script',
      arguments: '{"script":""}',
    });
  });

  it('returns null for output_item.done with non-function_call item', () => {
    const event = {
      type: 'response.output_item.done',
      item: {
        type: 'message',
        call_id: 'call-4',
        name: 'emit_draw_batch',
        arguments: '{}',
      },
    } as unknown as ResponseStreamEvent;

    expect(parseFunctionCallFromEvent(event)).toBeNull();
  });

  it('returns null for unrelated event types', () => {
    const event = {
      type: 'response.output_text.delta',
      delta: 'hello',
    } as unknown as ResponseStreamEvent;

    expect(parseFunctionCallFromEvent(event)).toBeNull();
  });

  it('returns null when call_id is missing', () => {
    const event = {
      type: 'response.function_call_arguments.done',
      name: 'emit_draw_batch',
      arguments: '{}',
    } as unknown as ResponseStreamEvent;

    expect(parseFunctionCallFromEvent(event)).toBeNull();
  });

  it('returns null when name is missing', () => {
    const event = {
      type: 'response.function_call_arguments.done',
      call_id: 'call-5',
      arguments: '{}',
    } as unknown as ResponseStreamEvent;

    expect(parseFunctionCallFromEvent(event)).toBeNull();
  });

  it('returns null when arguments is not a string', () => {
    const event = {
      type: 'response.function_call_arguments.done',
      call_id: 'call-6',
      name: 'emit_draw_batch',
      arguments: 42,
    } as unknown as ResponseStreamEvent;

    expect(parseFunctionCallFromEvent(event)).toBeNull();
  });

  it('returns null for output_item.done with missing item', () => {
    const event = {
      type: 'response.output_item.done',
    } as unknown as ResponseStreamEvent;

    expect(parseFunctionCallFromEvent(event)).toBeNull();
  });
});
