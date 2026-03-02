import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatSSE,
  formatSSEError,
  createEventCounter,
  createSSEHeartbeat,
  safeEnqueue,
  sseHeaders,
} from '@/lib/server/sse';

describe('sseHeaders', () => {
  it('returns correct content type', () => {
    const headers = sseHeaders() as Record<string, string>;
    expect(headers['Content-Type']).toContain('text/event-stream');
  });
});

describe('formatSSE', () => {
  it('formats basic payload', () => {
    const result = formatSSE({ type: 'test' });
    expect(result).toBe('data: {"type":"test"}\n\n');
  });

  it('includes id field when provided', () => {
    const result = formatSSE({ x: 1 }, { id: 42 });
    expect(result).toContain('id: 42\n');
    expect(result).toContain('data: ');
  });

  it('includes event field when provided', () => {
    const result = formatSSE({ x: 1 }, { event: 'error' });
    expect(result).toContain('event: error\n');
  });

  it('includes both id and event', () => {
    const result = formatSSE({ x: 1 }, { id: 1, event: 'ping' });
    expect(result).toBe('id: 1\nevent: ping\ndata: {"x":1}\n\n');
  });

  it('is backward compatible with no options', () => {
    const result = formatSSE('hello');
    expect(result).toBe('data: "hello"\n\n');
  });
});

describe('formatSSEError', () => {
  it('formats error with event type', () => {
    const result = formatSSEError('TIMEOUT', 'Request timed out');
    expect(result).toContain('event: error\n');
    expect(result).toContain('"code":"TIMEOUT"');
    expect(result).toContain('"message":"Request timed out"');
  });

  it('includes requestId when provided', () => {
    const result = formatSSEError('FAIL', 'oops', 'req-123');
    expect(result).toContain('"requestId":"req-123"');
  });
});

describe('createEventCounter', () => {
  it('starts at 0 and increments', () => {
    const counter = createEventCounter();
    expect(counter.next()).toBe(0);
    expect(counter.next()).toBe(1);
    expect(counter.next()).toBe(2);
  });

  it('counters are independent', () => {
    const a = createEventCounter();
    const b = createEventCounter();
    a.next();
    a.next();
    expect(b.next()).toBe(0);
  });
});

describe('createSSEHeartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends heartbeat comments at intervals', () => {
    vi.useFakeTimers();
    const chunks: Uint8Array[] = [];
    const controller = {
      enqueue: (chunk: Uint8Array) => chunks.push(chunk),
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    const hb = createSSEHeartbeat(controller, 100);
    vi.advanceTimersByTime(350);
    hb.stop();

    expect(chunks.length).toBe(3);
    const decoded = new TextDecoder().decode(chunks[0]);
    expect(decoded).toBe(':heartbeat\n\n');
  });

  it('stops sending after stop() is called', () => {
    vi.useFakeTimers();
    const chunks: Uint8Array[] = [];
    const controller = {
      enqueue: (chunk: Uint8Array) => chunks.push(chunk),
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    const hb = createSSEHeartbeat(controller, 100);
    vi.advanceTimersByTime(150);
    hb.stop();
    const countAfterStop = chunks.length;
    vi.advanceTimersByTime(300);
    expect(chunks.length).toBe(countAfterStop);
  });

  it('auto-stops when controller.enqueue throws (closed controller)', () => {
    vi.useFakeTimers();
    let callCount = 0;
    const controller = {
      enqueue: () => {
        callCount++;
        throw new Error('Controller is closed');
      },
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    createSSEHeartbeat(controller, 100);
    // First tick: enqueue throws, heartbeat should auto-clear
    vi.advanceTimersByTime(100);
    expect(callCount).toBe(1);
    // Further ticks should not attempt enqueue (interval cleared)
    vi.advanceTimersByTime(500);
    expect(callCount).toBe(1);
  });

  it('stop() is idempotent — calling twice does not throw', () => {
    vi.useFakeTimers();
    const controller = {
      enqueue: () => {},
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    const hb = createSSEHeartbeat(controller, 100);
    expect(() => {
      hb.stop();
      hb.stop();
    }).not.toThrow();
  });

  it('no enqueue attempts after auto-stop from closed controller', () => {
    vi.useFakeTimers();
    let callCount = 0;
    const controller = {
      enqueue: () => {
        callCount++;
        if (callCount >= 2) throw new Error('closed');
      },
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    createSSEHeartbeat(controller, 50);
    // First tick succeeds
    vi.advanceTimersByTime(50);
    expect(callCount).toBe(1);
    // Second tick throws and auto-clears
    vi.advanceTimersByTime(50);
    expect(callCount).toBe(2);
    // No further ticks
    vi.advanceTimersByTime(500);
    expect(callCount).toBe(2);
  });
});

describe('formatSSE edge cases', () => {
  it('handles payload with newlines and unicode', () => {
    const result = formatSSE({ text: 'line1\nline2', emoji: '🎉' });
    expect(result).toContain('data: ');
    expect(result).toMatch(/\n\n$/)
    // JSON.stringify escapes newlines, so no raw newline in the data line
    expect(result).toContain('\\n');
    expect(result).toContain('🎉');
  });

  it('handles deeply nested objects', () => {
    const nested = { a: { b: { c: { d: [1, 2, 3] } } } };
    const result = formatSSE(nested);
    expect(result).toBe(`data: ${JSON.stringify(nested)}\n\n`);
  });

  it('handles null payload', () => {
    const result = formatSSE(null);
    expect(result).toBe('data: null\n\n');
  });

  it('handles numeric payload', () => {
    const result = formatSSE(42);
    expect(result).toBe('data: 42\n\n');
  });
});

describe('safeEnqueue', () => {
  it('returns true and enqueues data on open controller', () => {
    const chunks: Uint8Array[] = [];
    const controller = {
      enqueue: (chunk: Uint8Array) => chunks.push(chunk),
    } as unknown as ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    const result = safeEnqueue(controller, 'data: test\n\n', encoder);
    expect(result).toBe(true);
    expect(chunks).toHaveLength(1);
    expect(new TextDecoder().decode(chunks[0])).toBe('data: test\n\n');
  });

  it('returns false without throwing on closed controller', () => {
    const controller = {
      enqueue: () => { throw new Error('Controller is closed'); },
    } as unknown as ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    const result = safeEnqueue(controller, 'data: test\n\n', encoder);
    expect(result).toBe(false);
  });

  it('returns false without throwing on TypeError (closed stream)', () => {
    const controller = {
      enqueue: () => { throw new TypeError('Cannot enqueue'); },
    } as unknown as ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    expect(() => safeEnqueue(controller, 'hello', encoder)).not.toThrow();
    expect(safeEnqueue(controller, 'hello', encoder)).toBe(false);
  });
});
