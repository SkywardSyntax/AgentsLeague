import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, correlationId, withCorrelationId, logStreamEvent } from '@/lib/server/logger';

describe('createLogger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes context fields in every log line', () => {
    const log = createLogger({ service: 'test', requestId: 'req-123' });
    log.info('hello');

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(entry.level).toBe('info');
    expect(entry.msg).toBe('hello');
    expect(entry.service).toBe('test');
    expect(entry.requestId).toBe('req-123');
    expect(entry.ts).toBeDefined();
  });

  it('merges extra fields into output', () => {
    const log = createLogger({ route: '/api/test' });
    log.warn('slow', { durationMs: 500 });

    const entry = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(entry.route).toBe('/api/test');
    expect(entry.durationMs).toBe(500);
  });

  it('writes errors to stderr', () => {
    const log = createLogger();
    log.error('boom');

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(entry.level).toBe('error');
  });
});

describe('correlationId', () => {
  it('returns a non-empty string', () => {
    const id = correlationId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('produces unique IDs across 1000 calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(correlationId());
    }
    expect(ids.size).toBe(1000);
  });
});

describe('withCorrelationId', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts X-Request-Id from request headers', () => {
    const req = new Request('http://localhost/test', {
      headers: { 'X-Request-Id': 'existing-id-42' },
    });
    const { log, requestId } = withCorrelationId(req, '/api/test');

    expect(requestId).toBe('existing-id-42');
    log.info('test_log');

    const entry = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(entry.requestId).toBe('existing-id-42');
    expect(entry.route).toBe('/api/test');
  });

  it('generates a correlation ID when X-Request-Id is missing', () => {
    const req = new Request('http://localhost/test');
    const { log, requestId } = withCorrelationId(req);

    expect(requestId).toBeTruthy();
    expect(requestId.length).toBeGreaterThan(0);
    log.info('test_log');

    const entry = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(entry.requestId).toBe(requestId);
  });

  it('every log call from returned logger includes requestId', () => {
    const req = new Request('http://localhost/test');
    const { log } = withCorrelationId(req, '/api/stream');

    log.info('first');
    log.warn('second', { extra: true });
    log.debug('third');

    for (const call of stdoutSpy.mock.calls) {
      const entry = JSON.parse(call[0] as string);
      expect(entry.requestId).toBeDefined();
      expect(entry.route).toBe('/api/stream');
    }
  });
});

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
