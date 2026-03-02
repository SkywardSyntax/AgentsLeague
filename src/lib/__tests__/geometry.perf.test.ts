import { describe, expect, it } from 'vitest';
import {
  resamplePolyline,
  partialPolylineByLength,
  cumulativeLengths,
  bezierLength,
} from '@/lib/whiteboard/geometry';
import type { BezierSegment } from '@/lib/whiteboard/geometry';

/** Generate a polyline with `n` points along a noisy path. */
function generatePolyline(n: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({ x: i * 2, y: Math.sin(i * 0.3) * 20 });
  }
  return pts;
}

/**
 * Compute a machine-relative baseline so thresholds adapt to CI variance.
 * Returns the time (ms) for a trivial array-fill operation.
 */
function machineBaseline(): number {
  const start = performance.now();
  for (let iter = 0; iter < 100; iter++) {
    Array.from({ length: 10_000 }, (_, i) => i * 2);
  }
  return (performance.now() - start) / 100;
}

describe('geometry performance benchmarks', () => {
  const baseline = machineBaseline();
  // Allow up to 50× baseline per operation (generous for CI variance)
  const maxMultiplier = 50;

  it('resamplePolyline: 2,000-point polyline with spacing=4', () => {
    const pts = generatePolyline(2000);
    const iterations = 100;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      resamplePolyline(pts, 4);
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(iterations * 0.5)]!;
    const p99 = times[Math.floor(iterations * 0.99)]!;

    // Relative threshold: p50 should be within reasonable range of baseline
    expect(p50).toBeLessThan(baseline * maxMultiplier);
    // Sanity: p99 should be finite
    expect(Number.isFinite(p99)).toBe(true);
  });

  it('partialPolylineByLength: 1,000 calls on 500-point stroke', () => {
    const pts = generatePolyline(500);
    const cumLen = cumulativeLengths(pts);
    const total = cumLen[cumLen.length - 1] ?? 0;

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      partialPolylineByLength(pts, cumLen, total * (i / 1000));
    }
    const elapsed = performance.now() - start;

    // 1,000 calls should complete within generous relative threshold
    expect(elapsed).toBeLessThan(baseline * maxMultiplier * 10);
  });

  it('cumulativeLengths: 1,000-point stroke', () => {
    const pts = generatePolyline(1000);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      cumulativeLengths(pts);
    }
    const elapsed = (performance.now() - start) / 100;

    expect(elapsed).toBeLessThan(baseline * maxMultiplier);
  });

  it('cumulativeLengths: batch of 50 strokes', () => {
    const strokes = Array.from({ length: 50 }, () => generatePolyline(1000));

    const start = performance.now();
    for (const pts of strokes) {
      cumulativeLengths(pts);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(baseline * maxMultiplier * 50);
  });

  it('bezierLength: 100 segments with 16 subdivisions', () => {
    const segs: BezierSegment[] = Array.from({ length: 100 }, (_, i) => ({
      p0: { x: i * 10, y: 0 },
      cp1: { x: i * 10 + 3, y: 5 },
      cp2: { x: i * 10 + 7, y: -5 },
      p3: { x: (i + 1) * 10, y: 0 },
    }));

    const start = performance.now();
    for (const seg of segs) {
      bezierLength(seg, 16);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(baseline * maxMultiplier);
  });
});
