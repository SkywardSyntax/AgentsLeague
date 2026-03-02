import { describe, it, expect } from 'vitest';
import { formatSSE } from '@/lib/server/sse';
import type { AgentSSEEvent } from '@/types/agent';

describe('SSE wire-format contract', () => {
  it('formatSSE output is parseable by the client SSE split pattern', () => {
    const payload: AgentSSEEvent = { type: 'assistant.text.delta', turnId: 't1', delta: 'hello' };
    const wire = formatSSE(payload);
    // Client uses: split(/\r?\n\r?\n/) then line.startsWith('data:')
    const parts = wire.split(/\r?\n\r?\n/).filter(Boolean);
    expect(parts).toHaveLength(1);
    const dataLine = parts[0]!.split(/\r?\n/).find(l => l.startsWith('data:'));
    expect(dataLine).toBeDefined();
    const json = dataLine!.slice(5).trim();
    expect(JSON.parse(json)).toEqual(payload);
  });

  it('multiple concatenated SSE frames split correctly', () => {
    const frames = [
      formatSSE({ type: 'assistant.text.delta', turnId: 't1', delta: 'a' }),
      formatSSE({ type: 'assistant.text.delta', turnId: 't1', delta: 'b' }),
      formatSSE({ type: 'turn.done', turnId: 't1' }),
    ].join('');
    const parts = frames.split(/\r?\n\r?\n/).filter(Boolean);
    expect(parts).toHaveLength(3);
  });
});
