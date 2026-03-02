import { describe, it, expect } from 'vitest';
import { clip, buildWhiteboardContextMessage, buildWhiteboardContextMessageV2 } from '@/lib/server/stream/context-builder';
import type { WhiteboardContext, StructuredWhiteboardContext } from '@/types/agent';

describe('clip', () => {
  it('returns input unchanged when shorter than max', () => {
    expect(clip('hello', 10)).toBe('hello');
  });

  it('truncates and appends ellipsis when longer than max', () => {
    const result = clip('abcdefghij', 5);
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result).toContain('…');
  });

  it('handles exact length', () => {
    expect(clip('abc', 3)).toBe('abc');
  });

  it('handles max=1', () => {
    expect(clip('abc', 1)).toBe('…');
  });
});

describe('buildWhiteboardContextMessage', () => {
  const ctx: WhiteboardContext = {
    elementCount: 3,
    bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    elementTypeCounts: { rect: 2, text: 1 },
    recentElements: [
      { id: 'r1', type: 'rect' },
      { id: 't1', type: 'text', textPreview: 'Hello world' },
    ],
    suggestedNextOrigin: { x: 50, y: 120 },
  };

  it('includes element count', () => {
    const msg = buildWhiteboardContextMessage(ctx);
    expect(msg).toContain('element_count=3');
  });

  it('includes bounds', () => {
    const msg = buildWhiteboardContextMessage(ctx);
    expect(msg).toContain('bounds=(0.0,0.0)..(100.0,100.0)');
  });

  it('includes type counts', () => {
    const msg = buildWhiteboardContextMessage(ctx);
    expect(msg).toContain('rect:2');
    expect(msg).toContain('text:1');
  });

  it('formats recent elements with text preview', () => {
    const msg = buildWhiteboardContextMessage(ctx);
    expect(msg).toContain('text:t1="Hello world"');
  });

  it('handles no bounds', () => {
    const noBounds = { ...ctx, bounds: undefined };
    const msg = buildWhiteboardContextMessage(noBounds);
    expect(msg).toContain('bounds=none');
  });
});

describe('buildWhiteboardContextMessageV2', () => {
  const ctx: StructuredWhiteboardContext = {
    scene_summary: {
      element_count: 5,
      bounds: { minX: 0, minY: 0, maxX: 500, maxY: 500 },
      type_counts: { rect: 3, latex: 2 },
    },
    occupied_regions: [
      { id: 'r1', x: 10, y: 10, w: 100, h: 50, semantic_kind: 'equation_stack', priority: 5 },
    ],
    anchors: [{ id: 'a1', x: 60, y: 35, role: 'center' }],
    recent_blocks: [{ id: 'b1', kind: 'equation_stack', region: 'left', text_preview: 'E=mc^2' }],
    suggested_next_regions: [
      { name: 'below', x: 0, y: 100, w: 500, h: 200, score: 0.95 },
    ],
    token_budget_hint: { max_chars: 5000 },
  };

  it('includes V2 header', () => {
    const msg = buildWhiteboardContextMessageV2(ctx);
    expect(msg).toContain('WHITEBOARD CONTEXT V2');
  });

  it('includes occupied regions', () => {
    const msg = buildWhiteboardContextMessageV2(ctx);
    expect(msg).toContain('r1@');
  });

  it('respects token budget clipping', () => {
    const small = { ...ctx, token_budget_hint: { max_chars: 50 } };
    const msg = buildWhiteboardContextMessageV2(small);
    expect(msg.length).toBeLessThanOrEqual(50);
  });
});
