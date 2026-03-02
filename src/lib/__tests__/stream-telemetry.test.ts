import { describe, it, expect } from 'vitest';
import { createStreamTelemetry } from '@/lib/agent/stream-telemetry';

describe('StreamTelemetry', () => {
  it('should start with empty state', () => {
    const telemetry = createStreamTelemetry();
    const snap = telemetry.snapshot();
    expect(snap.totalChunks).toBe(0);
    expect(snap.totalSessions).toBe(0);
  });

  it('should create and track a session', () => {
    const telemetry = createStreamTelemetry();
    const id = telemetry.startSession();
    expect(id).toBe(0);
    expect(telemetry.snapshot().totalSessions).toBe(1);
  });

  it('should record chunk latency', () => {
    const telemetry = createStreamTelemetry();
    const id = telemetry.startSession();
    telemetry.recordChunk(id, 25, 512);
    telemetry.recordChunk(id, 35, 1024);
    expect(telemetry.getAvgLatency()).toBe(30);
  });

  it('should compute throughput', () => {
    const telemetry = createStreamTelemetry();
    const id = telemetry.startSession();
    telemetry.recordChunk(id, 10, 500);
    telemetry.recordChunk(id, 10, 500);
    const throughput = telemetry.getThroughput();
    expect(throughput).toBeGreaterThanOrEqual(0);
  });

  it('should track error rate', () => {
    const telemetry = createStreamTelemetry();
    const id = telemetry.startSession();
    telemetry.recordChunk(id, 10, 100, false);
    telemetry.recordChunk(id, 10, 100, true);
    expect(telemetry.getErrorRate()).toBe(0.5);
  });

  it('should track reconnection count', () => {
    const telemetry = createStreamTelemetry();
    const id = telemetry.startSession();
    telemetry.recordReconnection(id);
    telemetry.recordReconnection(id);
    expect(telemetry.snapshot().avgReconnections).toBe(2);
  });

  it('should compute stream quality score', () => {
    const telemetry = createStreamTelemetry();
    const id = telemetry.startSession();
    telemetry.recordChunk(id, 10, 100);
    const score = telemetry.getQualityScore();
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should detect degradation with high latency', () => {
    const telemetry = createStreamTelemetry();
    const id = telemetry.startSession();
    telemetry.recordChunk(id, 300, 100);
    expect(telemetry.isDegraded(200)).toBe(true);
  });

  it('should detect degradation with high error rate', () => {
    const telemetry = createStreamTelemetry();
    const id = telemetry.startSession();
    telemetry.recordChunk(id, 10, 100, true);
    expect(telemetry.isDegraded(200, 0.5)).toBe(true);
  });

  it('should reset all data', () => {
    const telemetry = createStreamTelemetry();
    const id = telemetry.startSession();
    telemetry.recordChunk(id, 10, 100);
    telemetry.reset();
    expect(telemetry.snapshot().totalChunks).toBe(0);
    expect(telemetry.snapshot().totalSessions).toBe(0);
  });
});
