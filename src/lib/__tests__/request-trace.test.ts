import { describe, expect, it, vi } from 'vitest';
import { createRequestTracer } from '@/lib/server/request-trace';

describe('request-trace', () => {
  it('start() records entry with method, path, and startTs', () => {
    const tracer = createRequestTracer();
    tracer.start('r1', 'GET', '/api/health');
    const entry = tracer.getEntry('r1');
    expect(entry).toBeDefined();
    expect(entry!.method).toBe('GET');
    expect(entry!.path).toBe('/api/health');
    expect(entry!.startTs).toBeGreaterThan(0);
  });

  it('finish() sets endTs, durationMs, and status', async () => {
    const tracer = createRequestTracer();
    tracer.start('r2', 'POST', '/api/data');
    // Small delay so duration > 0
    await new Promise((r) => setTimeout(r, 5));
    tracer.finish('r2', 200, 512);
    const entry = tracer.getEntry('r2');
    expect(entry!.endTs).toBeGreaterThanOrEqual(entry!.startTs);
    expect(entry!.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry!.status).toBe(200);
    expect(entry!.responseBytes).toBe(512);
  });

  it('finishWithError() records error string and no status', () => {
    const tracer = createRequestTracer();
    tracer.start('r3', 'GET', '/fail');
    tracer.finishWithError('r3', 'connection reset');
    const entry = tracer.getEntry('r3');
    expect(entry!.error).toBe('connection reset');
    expect(entry!.status).toBeUndefined();
  });

  it('getEntry() returns undefined for unknown requestId', () => {
    const tracer = createRequestTracer();
    expect(tracer.getEntry('nonexistent')).toBeUndefined();
  });

  it('recentEntries() returns entries in reverse chronological order', () => {
    const tracer = createRequestTracer();
    tracer.start('a', 'GET', '/1');
    tracer.start('b', 'GET', '/2');
    tracer.start('c', 'GET', '/3');
    const recent = tracer.recentEntries();
    expect(recent[0]!.requestId).toBe('c');
    expect(recent[1]!.requestId).toBe('b');
    expect(recent[2]!.requestId).toBe('a');
  });

  it('recentEntries(5) limits output to 5 entries', () => {
    const tracer = createRequestTracer();
    for (let i = 0; i < 10; i++) {
      tracer.start(`r${i}`, 'GET', `/p${i}`);
    }
    const recent = tracer.recentEntries(5);
    expect(recent.length).toBe(5);
  });

  it('avgDurationMs() computes correct average over finished requests', () => {
    const tracer = createRequestTracer();
    // Mock Date.now to control duration
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    tracer.start('d1', 'GET', '/a');
    now.mockReturnValue(1100);
    tracer.finish('d1', 200);

    now.mockReturnValue(2000);
    tracer.start('d2', 'GET', '/b');
    now.mockReturnValue(2300);
    tracer.finish('d2', 200);

    // d1 = 100ms, d2 = 300ms → avg = 200ms
    expect(tracer.avgDurationMs()).toBe(200);
    now.mockRestore();
  });

  it('errorRate() returns fraction of errored requests', () => {
    const tracer = createRequestTracer();
    for (let i = 0; i < 10; i++) {
      tracer.start(`e${i}`, 'GET', `/p${i}`);
    }
    tracer.finishWithError('e0', 'fail');
    tracer.finishWithError('e1', 'fail');
    expect(tracer.errorRate()).toBeCloseTo(0.2);
  });

  it('entry count is capped at maxEntries (oldest evicted)', () => {
    const tracer = createRequestTracer(500);
    for (let i = 0; i < 600; i++) {
      tracer.start(`cap${i}`, 'GET', `/p${i}`);
    }
    const all = tracer.recentEntries();
    expect(all.length).toBe(500);
    // oldest (cap0) should be evicted
    expect(tracer.getEntry('cap0')).toBeUndefined();
    // newest should exist
    expect(tracer.getEntry('cap599')).toBeDefined();
  });

  it('reset() clears all entries', () => {
    const tracer = createRequestTracer();
    tracer.start('x1', 'GET', '/a');
    tracer.start('x2', 'GET', '/b');
    tracer.reset();
    expect(tracer.recentEntries()).toEqual([]);
    expect(tracer.getEntry('x1')).toBeUndefined();
  });
});
