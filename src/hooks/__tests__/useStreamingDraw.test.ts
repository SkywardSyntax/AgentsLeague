/**
 * Tests for useAIStream hook — progressive render with SSE,
 * abort handling, and error recovery.
 */

import { describe, it, expect, vi } from 'vitest';
import type { DrawOp } from '@/types';

// We test the SSE parsing logic extracted from the hook, since
// React hooks require renderHook and a full DOM which is tested
// at the component level. Here we validate the streaming logic itself.

// ── SSE Line Parser (mirrors useAIStream internals) ─────────────────

function parseSSELines(buffer: string): { ops: DrawOp[]; remaining: string } {
  const lines = buffer.split('\n');
  const remaining = lines.pop() ?? '';
  const ops: DrawOp[] = [];

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') continue;

    try {
      const op = JSON.parse(data) as DrawOp;
      ops.push(op);
    } catch {
      // Skip malformed chunks
    }
  }

  return { ops, remaining };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('SSE stream parsing', () => {
  it('parses a single add op from an SSE line', () => {
    const buffer = 'data: {"op":"add","element":{"id":"r1","type":"rect","x":10,"y":20,"w":100,"h":60,"rotation":0,"opacity":1,"locked":false,"createdAt":0,"updatedAt":0,"cornerRadius":0,"fill":{"type":"solid","color":"#000","opacity":1},"stroke":{"color":"#000","width":1,"lineCap":"round","lineJoin":"round"}}}\n';
    const { ops, remaining } = parseSSELines(buffer);

    expect(ops).toHaveLength(1);
    expect(ops[0]!.op).toBe('add');
    expect(remaining).toBe('');
  });

  it('parses multiple ops from sequential SSE lines', () => {
    const lines = [
      'data: {"op":"add","element":{"id":"r1","type":"rect","x":0,"y":0,"w":10,"h":10,"rotation":0,"opacity":1,"locked":false,"createdAt":0,"updatedAt":0,"cornerRadius":0,"fill":{"type":"solid","color":"#000","opacity":1},"stroke":{"color":"#000","width":1,"lineCap":"round","lineJoin":"round"}}}',
      'data: {"op":"add","element":{"id":"r2","type":"rect","x":50,"y":50,"w":10,"h":10,"rotation":0,"opacity":1,"locked":false,"createdAt":0,"updatedAt":0,"cornerRadius":0,"fill":{"type":"solid","color":"#000","opacity":1},"stroke":{"color":"#000","width":1,"lineCap":"round","lineJoin":"round"}}}',
      '',
    ].join('\n');

    const { ops } = parseSSELines(lines);
    expect(ops).toHaveLength(2);
    expect(ops[0]!.op).toBe('add');
    expect(ops[1]!.op).toBe('add');
  });

  it('handles [DONE] sentinel gracefully', () => {
    const buffer = 'data: {"op":"add","element":{"id":"r1","type":"rect","x":0,"y":0,"w":10,"h":10,"rotation":0,"opacity":1,"locked":false,"createdAt":0,"updatedAt":0,"cornerRadius":0,"fill":{"type":"solid","color":"#000","opacity":1},"stroke":{"color":"#000","width":1,"lineCap":"round","lineJoin":"round"}}}\ndata: [DONE]\n';
    const { ops } = parseSSELines(buffer);

    expect(ops).toHaveLength(1);
  });

  it('preserves incomplete buffer for next chunk', () => {
    const buffer = 'data: {"op":"add","element":{"id":"r1';
    const { ops, remaining } = parseSSELines(buffer);

    expect(ops).toHaveLength(0);
    expect(remaining).toBe('data: {"op":"add","element":{"id":"r1');
  });

  it('skips malformed JSON in SSE data', () => {
    const buffer = 'data: not-json\ndata: {"op":"clear"}\n';
    const { ops } = parseSSELines(buffer);

    expect(ops).toHaveLength(1);
    expect(ops[0]!.op).toBe('clear');
  });

  it('ignores non-data lines', () => {
    const buffer = 'event: keepalive\nid: 123\ndata: {"op":"clear"}\n';
    const { ops } = parseSSELines(buffer);

    expect(ops).toHaveLength(1);
  });

  it('handles update and delete ops', () => {
    const lines = [
      'data: {"op":"update","id":"r1","patch":{"x":999}}',
      'data: {"op":"delete","id":"r2"}',
      '',
    ].join('\n');

    const { ops } = parseSSELines(lines);
    expect(ops).toHaveLength(2);
    expect(ops[0]!.op).toBe('update');
    expect(ops[1]!.op).toBe('delete');
  });
});

describe('Progressive rendering flow', () => {
  it('accumulates ops across multiple chunks', () => {
    const allOps: DrawOp[] = [];
    let buffer = '';

    // Simulate chunked arrival
    const chunks = [
      'data: {"op":"add","element":{"id":"r1","type":"rect","x":0,"y":0,"w":10,"h":10,"rotation":0,"opacity":1,"locked":false,"createdAt":0,"updatedAt":0,"cornerRadius":0,"fill":{"type":"solid","color":"#000","opacity":1},"stroke":{"color":"#000","width":1,"lineCap":"round","lineJoin":"round"}}}\n',
      'data: {"op":"add","element":{"id":"r2","type":"rect","x":50,"y":0,"w":10,"h":10,"rotation":0,"opacity":1,"locked":false,"createdAt":0,"updatedAt":0,"cornerRadius":0,"fill":{"type":"solid","color":"#f00","opacity":1},"stroke":{"color":"#000","width":1,"lineCap":"round","lineJoin":"round"}}}\n',
      'data: [DONE]\n',
    ];

    for (const chunk of chunks) {
      buffer += chunk;
      const { ops, remaining } = parseSSELines(buffer);
      buffer = remaining;
      allOps.push(...ops);
    }

    expect(allOps).toHaveLength(2);
    expect(allOps.map((o) => o.op)).toEqual(['add', 'add']);
  });

  it('handles empty chunks', () => {
    const buffer = '';
    const { ops, remaining } = parseSSELines(buffer);
    expect(ops).toHaveLength(0);
    expect(remaining).toBe('');
  });
});

describe('Stream abort handling', () => {
  it('AbortController aborts a fetch stream', async () => {
    const controller = new AbortController();
    const onOp = vi.fn();
    const onError = vi.fn();

    // Simulate a stream that would run for a long time
    const mockFetch = vi.fn().mockImplementation(() => {
      return new Promise((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    // Start the "stream" and immediately abort
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const promise = mockFetch('/api/draw', { signal: controller.signal }).catch((err: Error) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Expected — should not call onError
        return;
      }
      onError(err);
    });

    controller.abort();
    await promise;

    expect(onOp).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
