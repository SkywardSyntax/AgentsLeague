import { describe, expect, it, vi } from 'vitest';
import type { DrawBatch, DrawElement } from '@/types/agent';
import {
  isStreamOverlayElementId,
  removeStreamOverlayFromScene,
  removeStreamOverlayFromBatches,
  extractStreamStepLines,
  toStreamTextKey,
  toStreamLatexKey,
} from '@/lib/whiteboard/stream-overlay';

// --- Test 1: All planner/index.ts re-exports are importable ---
describe('planner/index.ts re-exports', () => {
  it('all expected exports are importable and have the expected type', async () => {
    const planner = await import('@/lib/whiteboard/planner');

    const expectedFunctions = [
      'planSemanticBatch',
      'enforceDrawBatchConstraints',
      'lowerPlannedLayoutToDrawBatch',
      'buildStructuredWhiteboardContext',
      'extendStructuredWhiteboardContext',
      'fromLegacyDrawBatchToSemanticStub',
    ];
    for (const name of expectedFunctions) {
      expect(planner).toHaveProperty(name);
      expect(typeof (planner as Record<string, unknown>)[name]).toBe('function');
    }

    expect(planner).toHaveProperty('DEFAULT_PLANNER_CONFIG');
    expect(typeof planner.DEFAULT_PLANNER_CONFIG).toBe('object');
    expect(planner.DEFAULT_PLANNER_CONFIG).not.toBeNull();
  });
});

// --- Tests 2–8: stream-overlay.ts exports ---
describe('stream-overlay.ts dead code audit', () => {
  // Test 2: All 6 exports are importable and are functions
  it('all 6 exports are importable functions that do not throw on minimal input', async () => {
    const mod = await import('@/lib/whiteboard/stream-overlay');

    const expectedFunctions = [
      'isStreamOverlayElementId',
      'removeStreamOverlayFromScene',
      'removeStreamOverlayFromBatches',
      'extractStreamStepLines',
      'toStreamTextKey',
      'toStreamLatexKey',
    ];

    for (const name of expectedFunctions) {
      expect(mod).toHaveProperty(name);
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }

    // Call each with minimal valid input — no throw
    expect(() => mod.isStreamOverlayElementId('')).not.toThrow();
    expect(() => mod.removeStreamOverlayFromScene([])).not.toThrow();
    expect(() => mod.removeStreamOverlayFromBatches([])).not.toThrow();
    expect(() => mod.extractStreamStepLines('')).not.toThrow();
    expect(() => mod.toStreamTextKey('')).not.toThrow();
    expect(() => mod.toStreamLatexKey('')).not.toThrow();
  });

  // Test 3: toStreamTextKey produces deterministic normalized keys
  it('toStreamTextKey normalizes whitespace for deterministic keys', () => {
    expect(toStreamTextKey('  Step 1: foo  ')).toBe(toStreamTextKey('Step 1: foo'));
    // Also test tab normalization
    expect(toStreamTextKey('\tStep 1:\tfoo\t')).toBe(toStreamTextKey('Step 1: foo'));
  });

  // Test 4: toStreamLatexKey normalizes TeX whitespace
  it('toStreamLatexKey normalizes TeX whitespace', () => {
    expect(toStreamLatexKey('x^2  + y^2')).toBe(toStreamLatexKey('x^2 + y^2'));
    expect(toStreamLatexKey('  x^2 + y^2  ')).toBe(toStreamLatexKey('x^2 + y^2'));
  });

  // Test 5: extractStreamStepLines filters non-step content
  it('extractStreamStepLines filters non-step content', () => {
    const input = '1. First step\nRandom text\n2. Second step\n';
    const result = extractStreamStepLines(input);
    expect(result).toContain('1. First step');
    expect(result).toContain('2. Second step');
    expect(result).not.toContain('Random text');
  });

  // Test 6: isStreamOverlayElementId recognizes both prefixes
  it('isStreamOverlayElementId recognizes both prefixes', () => {
    expect(isStreamOverlayElementId('stream-text-123')).toBe(true);
    expect(isStreamOverlayElementId('stream-latex-456')).toBe(true);
    expect(isStreamOverlayElementId('regular-element-id')).toBe(false);
    expect(isStreamOverlayElementId('stream-other-789')).toBe(false);
  });

  // Test 7: removeStreamOverlayFromScene preserves non-overlay elements
  it('removeStreamOverlayFromScene preserves non-overlay elements', () => {
    const scene: DrawElement[] = [
      { id: 'stream-text-1', type: 'text', x: 0, y: 0, text: 'hello' },
      { id: 'stream-latex-2', type: 'latex', x: 10, y: 10, tex: 'x' },
      { id: 'regular-1', type: 'rect', x: 20, y: 20, w: 50, h: 50 },
    ];
    const result = removeStreamOverlayFromScene(scene);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('regular-1');
  });

  // Test 8: removeStreamOverlayFromBatches drops empty batches after filtering
  it('removeStreamOverlayFromBatches drops empty batches', () => {
    const batches: DrawBatch[] = [
      {
        batch_id: 'all-overlay',
        elements: [
          { id: 'stream-text-1', type: 'text', x: 0, y: 0, text: 'step' },
          { id: 'stream-latex-2', type: 'latex', x: 0, y: 0, tex: 'y' },
        ],
      },
    ];
    const result = removeStreamOverlayFromBatches(batches);
    expect(result).toEqual([]);
  });
});

// --- Test 9: rectPoints and withJitter are reachable from compileBatchToStrokes ---
describe('semantic-to-strokes reachability', () => {
  it('rectPoints is reachable via compileBatchToStrokes for rect elements', async () => {
    const { compileBatchToStrokes } = await import('@/lib/whiteboard/semantic-to-strokes');

    const batch: DrawBatch = {
      batch_id: 'rect-test',
      elements: [
        { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
      ],
    };

    const result = await compileBatchToStrokes(batch);
    expect(result.strokes.length).toBeGreaterThan(0);
    const rectStroke = result.strokes.find((s) => s.id.includes('-rect'));
    expect(rectStroke).toBeDefined();
    expect(rectStroke!.points.length).toBeGreaterThan(0);
  });

  // Test 10: withJitterAmount is called for text elements
  it('withJitterAmount is exercised for text elements via compileBatchToStrokes', async () => {
    // Mock renderTexToSvg to return a simple SVG with a path
    vi.doMock('@/lib/latex/mathjax-client', () => ({
      renderTexToSvg: vi.fn().mockResolvedValue(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20"><path d="M 0 10 L 50 10 L 100 10" /></svg>',
      ),
      extractSvgStrokes: vi.fn().mockReturnValue([
        {
          id: 'mock-stroke-0',
          elementId: 'txt1',
          points: [
            { x: 0, y: 10 },
            { x: 25, y: 10 },
            { x: 50, y: 10 },
          ],
          color: '#1f2a44',
          baseWidth: 1.45,
        },
      ]),
    }));

    // Re-import with the mock in place
    const { compileBatchToStrokes: compileWithMock } = await import(
      '@/lib/whiteboard/semantic-to-strokes'
    );

    const batch: DrawBatch = {
      batch_id: 'text-test',
      elements: [
        { id: 'txt1', type: 'text', x: 10, y: 20, text: 'Hello world' },
      ],
    };

    const result = await compileWithMock(batch);
    // Strokes are produced — this exercises the withJitterAmount call path
    expect(result.strokes.length).toBeGreaterThan(0);

    vi.doUnmock('@/lib/latex/mathjax-client');
  });
});
