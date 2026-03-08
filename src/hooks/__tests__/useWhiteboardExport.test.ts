import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWhiteboardExport } from '../useWhiteboardExport';
import type { WhiteboardExportHandle } from '@/lib/whiteboard/canvas-export';
import { exportStrokesToSVG, renderStrokesToBlob, DEFAULT_EXPORT_OPTIONS } from '@/lib/whiteboard/canvas-export';
import type { StrokeTrajectory } from '@/types/agent';
import { compressShareData, decompressShareData } from '@/lib/share-url';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeStroke(id: string, points: { x: number; y: number }[]): StrokeTrajectory {
  return {
    id,
    elementId: id,
    points,
    color: '#000000',
    baseWidth: 2,
  };
}

const sampleStrokes: StrokeTrajectory[] = [
  makeStroke('s1', [
    { x: 10, y: 10 },
    { x: 100, y: 10 },
    { x: 100, y: 100 },
    { x: 10, y: 100 },
  ]),
  makeStroke('s2', [
    { x: 50, y: 50 },
    { x: 150, y: 50 },
    { x: 150, y: 150 },
    { x: 50, y: 150 },
  ]),
];

// ── Tests for renderStrokesToBlob (hi-DPI) ────────────────────────────────────

describe('renderStrokesToBlob (hi-DPI)', () => {
  let savedOffscreenCanvas: unknown;

  beforeEach(() => {
    // Remove OffscreenCanvas so createOffscreen falls through to HTMLCanvasElement
    savedOffscreenCanvas = (globalThis as Record<string, unknown>).OffscreenCanvas;
    delete (globalThis as Record<string, unknown>).OffscreenCanvas;

    // Mock canvas 2d context for jsdom environment
    const mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      stroke: vi.fn(),
      setTransform: vi.fn(),
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(new Blob(['png-data'], { type: 'image/png' }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedOffscreenCanvas !== undefined) {
      (globalThis as Record<string, unknown>).OffscreenCanvas = savedOffscreenCanvas;
    }
  });

  it('renders a canvas at 2× scale producing dimensions roughly 2× the content bounds', async () => {
    const result1x = await renderStrokesToBlob(sampleStrokes, {
      ...DEFAULT_EXPORT_OPTIONS,
      scale: 1,
    });
    const result2x = await renderStrokesToBlob(sampleStrokes, {
      ...DEFAULT_EXPORT_OPTIONS,
      scale: 2,
    });

    // 2× export should have ~2× the pixel dimensions
    expect(result2x.width).toBeGreaterThanOrEqual(result1x.width * 1.9);
    expect(result2x.height).toBeGreaterThanOrEqual(result1x.height * 1.9);
    expect(result2x.width).toBeLessThanOrEqual(result1x.width * 2.1);
    expect(result2x.height).toBeLessThanOrEqual(result1x.height * 2.1);
    expect(result2x.blob).toBeInstanceOf(Blob);
    expect(result2x.blob.type).toBe('image/png');
  });

  it('renders a canvas at 4× scale for print quality', async () => {
    const result1x = await renderStrokesToBlob(sampleStrokes, {
      ...DEFAULT_EXPORT_OPTIONS,
      scale: 1,
    });
    const result4x = await renderStrokesToBlob(sampleStrokes, {
      ...DEFAULT_EXPORT_OPTIONS,
      scale: 4,
    });

    expect(result4x.width).toBeGreaterThanOrEqual(result1x.width * 3.9);
    expect(result4x.height).toBeGreaterThanOrEqual(result1x.height * 3.9);
  });

  it('throws when no strokes are provided', async () => {
    await expect(
      renderStrokesToBlob([], DEFAULT_EXPORT_OPTIONS),
    ).rejects.toThrow('No content to export');
  });
});

// ── Tests for exportStrokesToSVG ──────────────────────────────────────────────

describe('exportStrokesToSVG', () => {
  it('returns a string starting with <svg', () => {
    const svg = exportStrokesToSVG(sampleStrokes);
    expect(svg).toMatch(/^<svg\s/);
    expect(svg).toContain('</svg>');
  });

  it('contains <path> elements for each stroke', () => {
    const svg = exportStrokesToSVG(sampleStrokes);
    const pathCount = (svg.match(/<path /g) ?? []).length;
    expect(pathCount).toBe(sampleStrokes.length);
  });

  it('returns a valid empty SVG when no strokes are provided', () => {
    const svg = exportStrokesToSVG([]);
    expect(svg).toMatch(/^<svg\s/);
    expect(svg).toContain('width="0"');
  });

  it('embeds LaTeX SVG directly when latexElements are provided', () => {
    const latexStrokes = [
      makeStroke('latex-el-1', [
        { x: 200, y: 200 },
        { x: 300, y: 200 },
      ]),
    ];
    // Mark the stroke as belonging to the latex element
    latexStrokes[0]!.elementId = 'latex-el-1';

    const svg = exportStrokesToSVG(
      [...sampleStrokes, ...latexStrokes],
      {
        latexElements: [
          {
            id: 'latex-el-1',
            x: 200,
            y: 200,
            tex: 'x^2',
            displayMode: true,
            fontSize: 16,
            color: '#000000',
            cachedSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M 0 0 L 100 50"/></svg>',
          },
        ],
      },
    );

    expect(svg).toMatch(/^<svg\s/);
    // Should contain the embedded LaTeX group
    expect(svg).toContain('data-latex-id="latex-el-1"');
    expect(svg).toContain('data-tex="x^2"');
    // The inner SVG content should be embedded
    expect(svg).toContain('M 0 0 L 100 50');
    // The latex stroke paths should be filtered out (only 2 non-latex strokes remain)
    const pathElements = svg.match(/<path [^/]*data-stroke-id/g) ?? [];
    expect(pathElements.length).toBe(sampleStrokes.length);
  });

  it('falls back to stroke paths when cachedSvg is missing', () => {
    const svg = exportStrokesToSVG(sampleStrokes, {
      latexElements: [
        {
          id: 'no-cache',
          x: 0,
          y: 0,
          tex: 'y = mx + b',
          displayMode: false,
          fontSize: 16,
          color: '#000',
          // No cachedSvg — should not embed anything
        },
      ],
    });

    expect(svg).not.toContain('data-latex-id');
    // All strokes still rendered as paths
    const pathCount = (svg.match(/<path /g) ?? []).length;
    expect(pathCount).toBe(sampleStrokes.length);
  });
});

// ── Tests for share URL encoding / decoding round-trip ────────────────────────

describe('compressShareData / decompressShareData', () => {
  const sampleBatches = [
    {
      batch_id: 'b1',
      elements: [
        { id: 'el-1', type: 'rect', x: 0, y: 0, w: 100, h: 50 },
        { id: 'el-2', type: 'text', x: 10, y: 10, text: 'Hello world' },
      ],
    },
    {
      batch_id: 'b2',
      elements: [
        { id: 'el-3', type: 'latex', x: 50, y: 50, tex: '\\int_0^1 x^2 dx', displayMode: true },
      ],
    },
  ];

  it('round-trips JSON through compress/decompress', async () => {
    const json = JSON.stringify(sampleBatches);
    const compressed = await compressShareData(json);
    const decompressed = await decompressShareData(compressed);
    expect(decompressed).toBe(json);
  });

  it('produces a shorter token than raw base64 for large payloads', async () => {
    // Create a large payload that compresses well
    const largeBatches = Array.from({ length: 50 }, (_, i) => ({
      batch_id: `batch-${i}`,
      elements: Array.from({ length: 10 }, (_, j) => ({
        id: `el-${i}-${j}`,
        type: 'rect',
        x: i * 100,
        y: j * 50,
        w: 100,
        h: 50,
      })),
    }));
    const json = JSON.stringify(largeBatches);
    const compressed = await compressShareData(json);

    // Raw base64 would be ~4/3 the size of the JSON
    const rawBase64Length = Math.ceil((json.length * 4) / 3);
    // Compressed should be significantly shorter for repetitive data
    expect(compressed.length).toBeLessThan(rawBase64Length);
  });

  it('handles empty JSON', async () => {
    const compressed = await compressShareData('[]');
    const decompressed = await decompressShareData(compressed);
    expect(decompressed).toBe('[]');
  });

  it('handles unicode characters in JSON', async () => {
    const json = JSON.stringify([{ id: '1', text: '数学の公式 ∫ ∑ √' }]);
    const compressed = await compressShareData(json);
    const decompressed = await decompressShareData(compressed);
    expect(decompressed).toBe(json);
  });

  it('decompresses legacy plain-btoa tokens', async () => {
    // Simulate old-style share links that used plain btoa
    const json = JSON.stringify([{ batch_id: 'b1', elements: [] }]);
    const legacyToken = btoa(json);
    const decompressed = await decompressShareData(legacyToken);
    expect(decompressed).toBe(json);
  });
});

// ── Tests for useWhiteboardExport hook ────────────────────────────────────────

describe('useWhiteboardExport', () => {
  let mockHandle: WhiteboardExportHandle;

  beforeEach(() => {
    mockHandle = {
      exportAsPNG: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
      exportAsSVG: vi.fn().mockReturnValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      copyToClipboard: vi.fn().mockResolvedValue(undefined),
      getStrokeData: vi.fn().mockReturnValue([]),
      getContentBounds: vi.fn().mockReturnValue(null),
      clearCanvas: vi.fn(),
      fitToContent: vi.fn(),
    };
  });

  it('exportAsPNG delegates to handle with correct scale', async () => {
    const ref = { current: mockHandle };
    const { result } = renderHook(() => useWhiteboardExport(ref));
    const blob = await result.current.exportAsPNG({ scale: 2 });

    expect(mockHandle.exportAsPNG).toHaveBeenCalledWith(2, true);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('exportAsSVG delegates to handle and returns SVG string', () => {
    const ref = { current: mockHandle };
    const { result } = renderHook(() => useWhiteboardExport(ref));
    const svg = result.current.exportAsSVG();

    expect(mockHandle.exportAsSVG).toHaveBeenCalled();
    expect(svg).toMatch(/^<svg\s/);
  });

  it('throws when whiteboard ref is not ready', () => {
    const ref = { current: null };
    const { result } = renderHook(() => useWhiteboardExport(ref));

    expect(() => result.current.exportAsSVG()).toThrow('Whiteboard not ready');
  });
});
