import { describe, expect, it } from 'vitest';
import { createSpatialIndex } from '@/lib/whiteboard/spatial-index';

describe('spatial-index', () => {
  it('createSpatialIndex returns object with insert, query, clear', () => {
    const idx = createSpatialIndex(100);
    expect(typeof idx.insert).toBe('function');
    expect(typeof idx.query).toBe('function');
    expect(typeof idx.clear).toBe('function');
  });

  it('insert 1 rect, query its exact bounds returns that rect', () => {
    const idx = createSpatialIndex<string>(100);
    idx.insert('rect1', { minX: 10, minY: 10, maxX: 50, maxY: 50 });
    const results = idx.query({ minX: 10, minY: 10, maxX: 50, maxY: 50 });
    expect(results).toEqual(['rect1']);
  });

  it('insert 1 rect, query disjoint bounds returns empty array', () => {
    const idx = createSpatialIndex<string>(100);
    idx.insert('rect1', { minX: 10, minY: 10, maxX: 50, maxY: 50 });
    const results = idx.query({ minX: 500, minY: 500, maxX: 600, maxY: 600 });
    expect(results).toEqual([]);
  });

  it('insert 10 rects scattered, query small region returns only overlapping', () => {
    const idx = createSpatialIndex<number>(100);
    for (let i = 0; i < 10; i++) {
      const x = i * 200;
      idx.insert(i, { minX: x, minY: 0, maxX: x + 50, maxY: 50 });
    }
    // Query should hit only rect at x=0
    const results = idx.query({ minX: 0, minY: 0, maxX: 60, maxY: 60 });
    expect(results).toEqual([0]);
  });

  it('insert element at (0,0), query at (1500,1500) returns empty', () => {
    const idx = createSpatialIndex<string>(100);
    idx.insert('origin', { minX: 0, minY: 0, maxX: 30, maxY: 30 });
    const results = idx.query({ minX: 1500, minY: 1500, maxX: 1600, maxY: 1600 });
    expect(results).toEqual([]);
  });

  it('overlapping elements are all returned by query', () => {
    const idx = createSpatialIndex<string>(100);
    idx.insert('a', { minX: 0, minY: 0, maxX: 100, maxY: 100 });
    idx.insert('b', { minX: 50, minY: 50, maxX: 150, maxY: 150 });
    idx.insert('c', { minX: 200, minY: 200, maxX: 300, maxY: 300 });
    const results = idx.query({ minX: 40, minY: 40, maxX: 110, maxY: 110 });
    expect(results).toContain('a');
    expect(results).toContain('b');
    expect(results).not.toContain('c');
  });

  it('clear empties the index — subsequent query returns nothing', () => {
    const idx = createSpatialIndex<string>(100);
    idx.insert('x', { minX: 0, minY: 0, maxX: 50, maxY: 50 });
    idx.clear();
    expect(idx.query({ minX: 0, minY: 0, maxX: 50, maxY: 50 })).toEqual([]);
  });

  it('querying empty index returns empty array', () => {
    const idx = createSpatialIndex<string>(100);
    expect(idx.query({ minX: 0, minY: 0, maxX: 100, maxY: 100 })).toEqual([]);
  });

  it('insert 1000 elements, query small region completes in <5ms', () => {
    const idx = createSpatialIndex<number>(100);
    for (let i = 0; i < 1000; i++) {
      const x = (i % 50) * 32;
      const y = Math.floor(i / 50) * 32;
      idx.insert(i, { minX: x, minY: y, maxX: x + 30, maxY: y + 30 });
    }
    const start = performance.now();
    idx.query({ minX: 100, minY: 100, maxX: 200, maxY: 200 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });

  it('size returns correct count of indexed elements', () => {
    const idx = createSpatialIndex<string>(100);
    expect(idx.size()).toBe(0);
    idx.insert('a', { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    idx.insert('b', { minX: 20, minY: 20, maxX: 30, maxY: 30 });
    expect(idx.size()).toBe(2);
  });
});
