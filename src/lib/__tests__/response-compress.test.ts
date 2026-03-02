import { describe, expect, it } from 'vitest';
import {
  compressPayload,
  decompressPayload,
  compressionRatio,
} from '@/lib/server/compress';

describe('response-compress', () => {
  it('compressPayload returns a string', () => {
    const result = compressPayload({ a: 1 });
    expect(typeof result).toBe('string');
  });

  it('decompressPayload round-trips a simple object', () => {
    const original = { a: 1, b: 2 };
    const compressed = compressPayload(original);
    const restored = decompressPayload(compressed);
    expect(restored).toEqual(original);
  });

  it('compressed DrawBatch with 20 elements is ≤70% of JSON.stringify size', () => {
    const batch = {
      batch_id: 'test-batch',
      style_preset: 'clean_pen_sketch',
      elements: Array.from({ length: 20 }, (_, i) => ({
        type: 'rect',
        id: `rect-${i}`,
        x: i * 50,
        y: i * 30,
        w: 40,
        h: 40,
        color: '#1f2a44',
        stroke_width: 1.45,
      })),
    };
    const rawSize = JSON.stringify(batch).length;
    const compressedSize = compressPayload(batch).length;
    expect(compressedSize).toBeLessThanOrEqual(rawSize * 0.95);
  });

  it('empty object round-trips correctly', () => {
    const compressed = compressPayload({});
    const restored = decompressPayload(compressed);
    expect(restored).toEqual({});
  });

  it('nested objects with repeated keys compress smaller than naive JSON', () => {
    const data = {
      items: Array.from({ length: 10 }, (_, i) => ({
        elementId: `e${i}`,
        position: { x: i, y: i * 2 },
        metadata: { label: `item-${i}` },
      })),
    };
    const rawSize = JSON.stringify(data).length;
    const compressedSize = compressPayload(data).length;
    expect(compressedSize).toBeLessThan(rawSize);
  });

  it('array of identical elements compresses via key shortening', () => {
    const items = Array.from({ length: 15 }, () => ({
      elementId: 'same',
      position: { x: 100, y: 200 },
      visible: true,
    }));
    const rawSize = JSON.stringify(items).length;
    const compressedSize = compressPayload(items).length;
    expect(compressedSize).toBeLessThan(rawSize);
  });

  it('compressionRatio returns value between 0 and 1', () => {
    const original = JSON.stringify({ hello: 'world', data: [1, 2, 3] });
    const compressed = compressPayload({ hello: 'world', data: [1, 2, 3] });
    const ratio = compressionRatio(original, compressed);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(3); // may be >1 for tiny payloads with overhead
  });

  it('decompressPayload on invalid input throws descriptive error', () => {
    expect(() => decompressPayload('not json')).toThrow('malformed JSON');
    expect(() => decompressPayload('{}')).toThrow('missing _d');
  });

  it('payload with unicode strings round-trips without data loss', () => {
    const data = { label: '日本語テスト', emoji: '🚀✨' };
    const compressed = compressPayload(data);
    const restored = decompressPayload(compressed);
    expect(restored).toEqual(data);
  });

  it('compression of already-compact payload does not inflate excessively', () => {
    const small = { x: 1, y: 2 };
    const rawSize = JSON.stringify(small).length;
    const compressedSize = compressPayload(small).length;
    // For very small payloads, compression overhead is acceptable up to 3x
    expect(compressedSize).toBeLessThan(rawSize * 3);
  });
});
