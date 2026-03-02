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

  it('redacts userMessage to length only', () => {
    logStreamEvent('info', 'stream start', {
      requestId: 'r1',
      userMessage: 'This is my private question about finances',
    });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.userMessage).toBe('[REDACTED length=42]');
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
});
