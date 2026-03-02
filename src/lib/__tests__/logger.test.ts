import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, correlationId, withCorrelationId } from '@/lib/server/logger';

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
