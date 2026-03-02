import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the AbortError detection logic extracted from useAgentStream
// We cannot import the React hook directly, so we test the error-handling logic

function classifyStreamError(error: unknown): 'abort' | 'error' {
  if (error instanceof DOMException && error.name === 'AbortError') return 'abort';
  if (error instanceof Error && error.name === 'AbortError') return 'abort';
  return 'error';
}

describe('AbortError detection', () => {
  it('detects DOMException with name AbortError', () => {
    const err = new DOMException('The operation was aborted', 'AbortError');
    expect(classifyStreamError(err)).toBe('abort');
  });

  it('detects Error with name AbortError', () => {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    expect(classifyStreamError(err)).toBe('abort');
  });

  it('detects DOMException with different message but AbortError name', () => {
    const err = new DOMException('signal is aborted without reason', 'AbortError');
    expect(classifyStreamError(err)).toBe('abort');
  });

  it('does NOT treat a plain string "AbortError" as abort', () => {
    expect(classifyStreamError('AbortError')).toBe('error');
  });

  it('does NOT treat a plain object with name AbortError as abort', () => {
    expect(classifyStreamError({ name: 'AbortError' })).toBe('error');
  });

  it('treats a non-AbortError DOMException as error', () => {
    const err = new DOMException('Not found', 'NotFoundError');
    expect(classifyStreamError(err)).toBe('error');
  });

  it('treats a regular Error as error', () => {
    const err = new Error('Network failure');
    expect(classifyStreamError(err)).toBe('error');
  });

  it('treats null/undefined as error', () => {
    expect(classifyStreamError(null)).toBe('error');
    expect(classifyStreamError(undefined)).toBe('error');
  });
});

describe('SSE buffer chunking', () => {
  // Simulate the SSE parser from useAgentStream
  function parseSSEBuffer(chunks: string[]): { events: unknown[]; errors: string[] } {
    const events: unknown[] = [];
    const errors: string[] = [];
    let buffer = '';
    const splitChunks = (raw: string) => raw.split(/\r?\n\r?\n/);

    for (const chunk of chunks) {
      buffer += chunk;
      const parts = splitChunks(buffer);
      if (parts.length <= 1) continue;

      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const lines = part
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data:'));
        for (const line of lines) {
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            events.push(JSON.parse(json));
          } catch {
            errors.push('Invalid SSE JSON payload received');
          }
        }
      }
    }

    // Trailing buffer
    const trailing = buffer.trim();
    if (trailing.startsWith('data:')) {
      const json = trailing.slice(5).trim();
      if (json) {
        try {
          events.push(JSON.parse(json));
        } catch {
          errors.push('Invalid trailing SSE JSON payload received');
        }
      }
    }

    return { events, errors };
  }

  it('parses a simple single-chunk SSE event', () => {
    const { events, errors } = parseSSEBuffer(['data: {"type":"done"}\n\n']);
    expect(errors).toHaveLength(0);
    expect(events).toEqual([{ type: 'done' }]);
  });

  it('reassembles a JSON event split across two chunks at delimiter boundary', () => {
    const { events, errors } = parseSSEBuffer([
      'data: {"type":"hello"}\n',
      '\ndata: {"type":"world"}\n\n',
    ]);
    expect(errors).toHaveLength(0);
    expect(events).toEqual([{ type: 'hello' }, { type: 'world' }]);
  });

  it('handles CRLF line endings', () => {
    const { events, errors } = parseSSEBuffer([
      'data: {"type":"cr"}\r\n\r\ndata: {"type":"lf"}\r\n\r\n',
    ]);
    expect(errors).toHaveLength(0);
    expect(events).toEqual([{ type: 'cr' }, { type: 'lf' }]);
  });

  it('handles mixed CRLF and LF line endings', () => {
    const { events, errors } = parseSSEBuffer([
      'data: {"a":1}\r\n\n',
      'data: {"b":2}\n\r\n',
    ]);
    expect(errors).toHaveLength(0);
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('handles trailing buffer without double newline', () => {
    const { events, errors } = parseSSEBuffer([
      'data: {"type":"first"}\n\n',
      'data: {"type":"last"}',
    ]);
    expect(errors).toHaveLength(0);
    expect(events).toEqual([{ type: 'first' }, { type: 'last' }]);
  });

  it('handles chunk split mid-JSON payload', () => {
    const { events, errors } = parseSSEBuffer([
      'data: {"typ',
      'e":"split"}\n\n',
    ]);
    expect(errors).toHaveLength(0);
    expect(events).toEqual([{ type: 'split' }]);
  });

  it('reports error for invalid JSON', () => {
    const { events, errors } = parseSSEBuffer(['data: {invalid}\n\n']);
    expect(events).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Invalid SSE JSON');
  });

  it('handles multiple events in a single chunk', () => {
    const { events, errors } = parseSSEBuffer([
      'data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":3}\n\n',
    ]);
    expect(errors).toHaveLength(0);
    expect(events).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
});
