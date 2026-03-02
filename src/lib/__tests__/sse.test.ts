import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatSSE,
  formatSSEError,
  createEventCounter,
  createSSEHeartbeat,
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
});
