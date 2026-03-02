import { describe, it, expect } from 'vitest';
import { createFlakyDetector } from '../flaky-detector';

describe('flaky-detector', () => {
  it('returns object with record, analyze, summary, reset', () => {
    const detector = createFlakyDetector();
    expect(typeof detector.record).toBe('function');
    expect(typeof detector.analyze).toBe('function');
    expect(typeof detector.summary).toBe('function');
    expect(typeof detector.reset).toBe('function');
  });

  it('recording 5 passes marks test as not flaky', () => {
    const detector = createFlakyDetector();
    for (let i = 0; i < 5; i++) detector.record('test-a', true);
    const report = detector.analyze();
    expect(report).toHaveLength(1);
    expect(report[0].flaky).toBe(false);
  });

  it('recording 5 failures marks test as not flaky', () => {
    const detector = createFlakyDetector();
    for (let i = 0; i < 5; i++) detector.record('test-a', false);
    const report = detector.analyze();
    expect(report).toHaveLength(1);
    expect(report[0].flaky).toBe(false);
  });

  it('recording 3 passes + 2 failures marks test as flaky', () => {
    const detector = createFlakyDetector();
    for (let i = 0; i < 3; i++) detector.record('test-a', true);
    for (let i = 0; i < 2; i++) detector.record('test-a', false);
    const report = detector.analyze();
    expect(report).toHaveLength(1);
    expect(report[0].flaky).toBe(true);
  });

  it('passCount and failCount match recorded values', () => {
    const detector = createFlakyDetector();
    for (let i = 0; i < 3; i++) detector.record('test-a', true);
    for (let i = 0; i < 2; i++) detector.record('test-a', false);
    const report = detector.analyze();
    expect(report[0].passCount).toBe(3);
    expect(report[0].failCount).toBe(2);
  });

  it('summary reports correct total, flaky, stable, flakyRate', () => {
    const detector = createFlakyDetector();
    // test-a: stable pass
    for (let i = 0; i < 5; i++) detector.record('test-a', true);
    // test-b: flaky
    for (let i = 0; i < 3; i++) detector.record('test-b', true);
    for (let i = 0; i < 2; i++) detector.record('test-b', false);
    // test-c: stable fail
    for (let i = 0; i < 5; i++) detector.record('test-c', false);

    const s = detector.summary();
    expect(s.total).toBe(3);
    expect(s.flaky).toBe(1);
    expect(s.stable).toBe(2);
  });

  it('flakyRate is flaky/total between 0 and 1', () => {
    const detector = createFlakyDetector();
    for (let i = 0; i < 5; i++) detector.record('test-a', true);
    detector.record('test-b', true);
    detector.record('test-b', false);

    const s = detector.summary();
    expect(s.flakyRate).toBe(1 / 2);
    expect(s.flakyRate).toBeGreaterThanOrEqual(0);
    expect(s.flakyRate).toBeLessThanOrEqual(1);
  });

  it('reset clears all data — analyze returns empty array', () => {
    const detector = createFlakyDetector();
    detector.record('test-a', true);
    detector.reset();
    expect(detector.analyze()).toEqual([]);
  });

  it('multiple tests recorded in interleaved order are analyzed independently', () => {
    const detector = createFlakyDetector();
    detector.record('test-a', true);
    detector.record('test-b', false);
    detector.record('test-a', true);
    detector.record('test-b', true);
    detector.record('test-a', false);

    const report = detector.analyze();
    const a = report.find((e) => e.testName === 'test-a')!;
    const b = report.find((e) => e.testName === 'test-b')!;

    expect(a.passCount).toBe(2);
    expect(a.failCount).toBe(1);
    expect(a.flaky).toBe(true);

    expect(b.passCount).toBe(1);
    expect(b.failCount).toBe(1);
    expect(b.flaky).toBe(true);
  });

  it('recording zero runs and calling analyze returns empty array', () => {
    const detector = createFlakyDetector();
    expect(detector.analyze()).toEqual([]);
  });
});
