import type { ResponseStreamEvent } from 'openai/resources/responses/responses';

export type FunctionCall = {
  callId: string;
  name: string;
  arguments: string;
};

/** Safely access a property on an unknown value after a runtime guard. */
export function prop(obj: unknown, key: string): unknown {
  if (obj != null && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

export function parseFunctionCallFromEvent(
  event: ResponseStreamEvent,
): FunctionCall | null {
  if (event.type === 'response.function_call_arguments.done') {
    const callId = prop(event, 'call_id') ?? prop(prop(event, 'item'), 'call_id');
    const name = prop(event, 'name') ?? prop(prop(event, 'item'), 'name');
    const args = prop(event, 'arguments') ?? prop(prop(event, 'item'), 'arguments');
    if (typeof callId === 'string' && callId && typeof name === 'string' && name && typeof args === 'string') {
      return { callId, name, arguments: args };
    }
  }

  if (event.type === 'response.output_item.done') {
    const item = prop(event, 'item');
    if (prop(item, 'type') === 'function_call') {
      const callId = prop(item, 'call_id');
      const name = prop(item, 'name');
      const args = prop(item, 'arguments');
      if (typeof callId === 'string' && callId && typeof name === 'string' && name && typeof args === 'string') {
        return { callId, name, arguments: args };
      }
    }
  }

  return null;
}
