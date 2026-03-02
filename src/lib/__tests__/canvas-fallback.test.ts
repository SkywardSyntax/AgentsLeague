import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectCanvasSupport,
  buildFallbackDescriptor,
  formatContextLossWarning,
  type CanvasSupportResult,
} from '@/lib/whiteboard/canvas-fallback';
import type { DrawElement } from '@/types/agent';

function makeRect(id: string, x = 0, y = 0, w = 100, h = 50): DrawElement {
  return { type: 'rect', id, x, y, w, h };
}

describe('canvas-fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1
  it('detectCanvasSupport returns { canvas2d: true, webgl: true } when both contexts succeed', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as any);
    vi.spyOn(canvas, 'getContext').mockImplementation((type: string) => {
      if (type === '2d') return {} as CanvasRenderingContext2D;
      if (type === 'webgl') return {} as WebGLRenderingContext;
      return null;
    });
    const result = detectCanvasSupport();
    expect(result.canvas2d).toBe(true);
    expect(result.webgl).toBe(true);
  });

  // Test 2
  it('detectCanvasSupport returns { canvas2d: false } with reason when 2D context fails', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as any);
    vi.spyOn(canvas, 'getContext').mockImplementation((type: string) => {
      if (type === '2d') return null;
      if (type === 'webgl') return {} as WebGLRenderingContext;
      return null;
    });
    const result = detectCanvasSupport();
    expect(result.canvas2d).toBe(false);
    expect(result.reason).toBe('getContext returned null');
  });

  // Test 3
  it('detectCanvasSupport returns { webgl: false } with reason when WebGL throws SecurityError', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as any);
    vi.spyOn(canvas, 'getContext').mockImplementation((type: string) => {
      if (type === '2d') return {} as CanvasRenderingContext2D;
      if (type === 'webgl') throw new Error('SecurityError');
      return null;
    });
    const result = detectCanvasSupport();
    expect(result.canvas2d).toBe(true);
    expect(result.webgl).toBe(false);
    expect(result.reason).toContain('SecurityError');
  });

  // Test 4
  it('buildFallbackDescriptor with canvas2d:false and empty scene returns no-content', () => {
    const support: CanvasSupportResult = { canvas2d: false, webgl: false, reason: 'null' };
    const result = buildFallbackDescriptor(support, []);
    expect(result.type).toBe('no-content');
  });

  // Test 5
  it('buildFallbackDescriptor with canvas2d:false and 3 elements returns element-list with 3 entries', () => {
    const support: CanvasSupportResult = { canvas2d: false, webgl: false, reason: 'null' };
    const elements: DrawElement[] = [makeRect('a'), makeRect('b'), makeRect('c')];
    const result = buildFallbackDescriptor(support, elements);
    expect(result.type).toBe('element-list');
    if (result.type === 'element-list') {
      expect(result.entries).toHaveLength(3);
    }
  });

  // Test 6
  it('each entry in element-list contains id, type, and human-readable position', () => {
    const support: CanvasSupportResult = { canvas2d: false, webgl: false };
    const elements: DrawElement[] = [makeRect('r1', 10, 20, 30, 40)];
    const result = buildFallbackDescriptor(support, elements);
    if (result.type === 'element-list') {
      const entry = result.entries[0];
      expect(entry.id).toBe('r1');
      expect(entry.type).toBe('rect');
      expect(entry.position).toContain('10');
      expect(entry.position).toContain('20');
    }
  });

  // Test 7
  it('buildFallbackDescriptor with >20 elements returns summary with count and bounding box', () => {
    const support: CanvasSupportResult = { canvas2d: false, webgl: false };
    const elements: DrawElement[] = Array.from({ length: 25 }, (_, i) =>
      makeRect(`r${i}`, i * 10, i * 10, 50, 50),
    );
    const result = buildFallbackDescriptor(support, elements);
    expect(result.type).toBe('summary');
    if (result.type === 'summary') {
      expect(result.count).toBe(25);
      expect(result.boundingBox).toBeDefined();
      expect(result.boundingBox.minX).toBe(0);
      expect(result.boundingBox.minY).toBe(0);
    }
  });

  // Test 8
  it('buildFallbackDescriptor with canvas2d:true returns type none', () => {
    const support: CanvasSupportResult = { canvas2d: true, webgl: true };
    const result = buildFallbackDescriptor(support, [makeRect('x')]);
    expect(result.type).toBe('none');
  });

  // Test 9
  it('formatContextLossWarning produces string containing the failure reason', () => {
    const support: CanvasSupportResult = { canvas2d: false, webgl: false, reason: 'out of memory' };
    const warning = formatContextLossWarning(support);
    expect(warning).toContain('out of memory');
  });

  // Test 10
  it('detectCanvasSupport handles createElement throwing without crashing', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('JSDOM limitation');
    });
    const result = detectCanvasSupport();
    expect(result.canvas2d).toBe(false);
    expect(result.webgl).toBe(false);
    expect(result.reason).toBe('createElement threw');
  });
});
