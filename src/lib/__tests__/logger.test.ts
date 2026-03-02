import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logStreamEvent } from '@/lib/server/logger';

describe('logStreamEvent', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs valid JSON', () => {
    logStreamEvent('info', 'test message');
    expect(consoleSpy).toHaveBeenCalledOnce();
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('includes required fields: timestamp, level, message', () => {
    logStreamEvent('info', 'stream started', { requestId: 'abc-123' });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('level', 'info');
    expect(parsed).toHaveProperty('message', 'stream started');
    expect(parsed).toHaveProperty('requestId', 'abc-123');
  });

  it('includes valid ISO timestamp', () => {
    logStreamEvent('info', 'test');
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
  });

  it('uses console.error for error level', () => {
    const errorSpy = vi.spyOn(console, 'error');
    logStreamEvent('error', 'something failed', { code: 'ERR_001' });
    expect(errorSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('error');
  });

  it('uses console.warn for warn level', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    logStreamEvent('warn', 'something concerning');
    expect(warnSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('warn');
  });

  it('merges extra data fields into output', () => {
    logStreamEvent('info', 'done', { durationMs: 1234, eventCount: 42 });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.durationMs).toBe(1234);
    expect(parsed.eventCount).toBe(42);
  });

  it('redacts userMessage', () => {
    logStreamEvent('info', 'stream start', {
      requestId: 'r1',
      userMessage: 'This is my private question about finances',
    });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.userMessage).toBe('[REDACTED]');
    expect(parsed.userMessage).not.toContain('private');
  });

  it('redacts password, token, secret, apiKey, api_key, authorization fields', () => {
    logStreamEvent('info', 'test', {
      password: 'hunter2',
      token: 'tok_abc',
      secret: 's3cr3t',
      apiKey: 'sk-123',
      api_key: 'sk-456',
      authorization: 'Bearer xyz',
    });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.password).toMatch(/^\[REDACTED/);
    expect(parsed.token).toMatch(/^\[REDACTED/);
    expect(parsed.secret).toMatch(/^\[REDACTED/);
    expect(parsed.apiKey).toMatch(/^\[REDACTED/);
    expect(parsed.api_key).toMatch(/^\[REDACTED/);
    expect(parsed.authorization).toMatch(/^\[REDACTED/);
  });

  it('redacts non-string sensitive values', () => {
    logStreamEvent('info', 'test', { userMessage: 12345 });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.userMessage).toBe('[REDACTED]');
  });

  it('does not redact safe fields', () => {
    logStreamEvent('info', 'test', { requestId: 'r1', sessionId: 's1', durationMs: 100 });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.requestId).toBe('r1');
    expect(parsed.sessionId).toBe('s1');
    expect(parsed.durationMs).toBe(100);
  });

  it('redacts nested sensitive fields', () => {
    logStreamEvent('info', 'test', {
      context: { userMessage: 'secret prompt' },
    });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.context.userMessage).toBe('[REDACTED]');
  });

  it('redacts deeply nested api_key', () => {
    logStreamEvent('info', 'test', {
      data: { nested: { api_key: 'sk-xxx' } },
    });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.data.nested.api_key).toBe('[REDACTED]');
  });

  it('handles circular references without throwing', () => {
    const obj: Record<string, unknown> = { safe: 'value' };
    obj.self = obj;
    expect(() => logStreamEvent('info', 'test', obj)).not.toThrow();
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.self).toBe('[Circular]');
  });

  it('does not leak sensitive values anywhere in JSON output', () => {
    logStreamEvent('info', 'test', {
      context: { userMessage: 'super-secret-value' },
      token: 'tok-hidden',
    });
    const raw = consoleSpy.mock.calls[0][0] as string;
    expect(raw).not.toContain('super-secret-value');
    expect(raw).not.toContain('tok-hidden');
  });

  it('redacts case-insensitively (Bearer, Authorization)', () => {
    logStreamEvent('info', 'test', { Bearer: 'xyz', Authorization: 'Basic abc' });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.Bearer).toBe('[REDACTED]');
    expect(parsed.Authorization).toBe('[REDACTED]');
  });

  it('handles arrays of objects with sensitive fields', () => {
    logStreamEvent('info', 'test', {
      items: [{ apiKey: 'sk-1' }, { safe: 'ok' }],
    });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.items[0].apiKey).toBe('[REDACTED]');
    expect(parsed.items[1].safe).toBe('ok');
  });
});
