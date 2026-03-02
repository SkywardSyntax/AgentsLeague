import { describe, it, expect } from 'vitest';
import { validateStreamConfig } from '@/lib/network/stream-config';

describe('StreamConfigSchema', () => {
  it('accepts a fully valid configuration', () => {
    const config = validateStreamConfig({
      timeoutMs: 15000, retryDelayMs: 2000, maxReconnects: 10,
      bufferSizeBytes: 131072, allowedEventTypes: ['message', 'ping'],
    });
    expect(config.timeoutMs).toBe(15000);
    expect(config.maxReconnects).toBe(10);
  });

  it('applies defaults when fields are omitted', () => {
    const config = validateStreamConfig({});
    expect(config.timeoutMs).toBe(30000);
    expect(config.retryDelayMs).toBe(1000);
    expect(config.maxReconnects).toBe(5);
    expect(config.bufferSizeBytes).toBe(65536);
  });

  it('rejects timeout below 100ms', () => {
    expect(() => validateStreamConfig({ timeoutMs: 50 })).toThrow();
  });

  it('rejects retry delay exceeding 30000ms', () => {
    expect(() => validateStreamConfig({ retryDelayMs: 31000 })).toThrow();
  });

  it('rejects negative reconnect count', () => {
    expect(() => validateStreamConfig({ maxReconnects: -1 })).toThrow();
  });

  it('rejects buffer size exceeding 10MB', () => {
    expect(() => validateStreamConfig({ bufferSizeBytes: 11 * 1024 * 1024 })).toThrow();
  });

  it('rejects empty event types array', () => {
    expect(() => validateStreamConfig({ allowedEventTypes: [] })).toThrow();
  });

  it('rejects event types with empty strings', () => {
    expect(() => validateStreamConfig({ allowedEventTypes: [''] })).toThrow();
  });

  it('allows zero reconnects (disable reconnection)', () => {
    const config = validateStreamConfig({ maxReconnects: 0 });
    expect(config.maxReconnects).toBe(0);
  });

  it('validates at exact boundary values', () => {
    const config = validateStreamConfig({
      timeoutMs: 100, retryDelayMs: 50, maxReconnects: 100,
      bufferSizeBytes: 1024,
    });
    expect(config.timeoutMs).toBe(100);
    expect(config.retryDelayMs).toBe(50);
    expect(config.maxReconnects).toBe(100);
    expect(config.bufferSizeBytes).toBe(1024);
  });
});
