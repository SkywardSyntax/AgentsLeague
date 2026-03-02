import { describe, expect, it } from 'vitest';
import { buildWhiteboardContext, buildWhiteboardContextV2 } from '@/lib/whiteboard/context';
import type {
  DrawElement,
  RectElement,
  EllipseElement,
  LineElement,
  LatexElement,
  SemanticBatch,
} from '@/types/agent';

function makeRect(overrides: Partial<RectElement> = {}): RectElement {
  return { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50, ...overrides };
}

function makeEllipse(overrides: Partial<EllipseElement> = {}): EllipseElement {
  return { id: 'e1', type: 'ellipse', cx: 200, cy: 100, rx: 40, ry: 30, ...overrides };
}

function makeLine(overrides: Partial<LineElement> = {}): LineElement {
  return { id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 300, y: 150 }, ...overrides };
}

function makeLatex(overrides: Partial<LatexElement> = {}): LatexElement {
  return { id: 'x1', type: 'latex', x: 50, y: 60, tex: 'E=mc^2', ...overrides };
}

describe('buildWhiteboardContext', () => {
  it('returns defaults for empty elements array', () => {
    const ctx = buildWhiteboardContext([]);
    expect(ctx.elementCount).toBe(0);
    expect(ctx.bounds).toBeUndefined();
    expect(ctx.suggestedNextOrigin).toEqual({ x: 64, y: 96 });
  });

  it('computes correct bounds for a single rect element', () => {
    const rect = makeRect({ x: 10, y: 20, w: 100, h: 50 });
    const ctx = buildWhiteboardContext([rect]);
    expect(ctx.bounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });

  it('computes aggregate bounds across mixed types', () => {
    const rect = makeRect({ x: 10, y: 20, w: 100, h: 50 });
    const ellipse = makeEllipse({ cx: 200, cy: 100, rx: 40, ry: 30 });
    const line = makeLine({ from: { x: 0, y: 0 }, to: { x: 300, y: 150 } });
    const elements: DrawElement[] = [rect, ellipse, line];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.bounds).toBeDefined();
    expect(ctx.bounds!.minX).toBe(0);
    expect(ctx.bounds!.minY).toBe(0);
    expect(ctx.bounds!.maxX).toBe(300);
    expect(ctx.bounds!.maxY).toBe(150);
  });

  it('counts element types correctly', () => {
    const elements: DrawElement[] = [
      makeRect({ id: 'r1' }),
      makeRect({ id: 'r2' }),
      makeEllipse({ id: 'e1' }),
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.elementTypeCounts).toEqual({ rect: 2, ellipse: 1 });
  });

  it('computes latex element with displayMode height multiplier', () => {
    const latex = makeLatex({ displayMode: true, fontSize: 20 });
    const ctx = buildWhiteboardContext([latex]);
    expect(ctx.bounds).toBeDefined();
    // height = fontSize * 2.1 = 42
    const expectedMaxY = latex.y + 20 * 2.1;
    expect(ctx.bounds!.maxY).toBeCloseTo(expectedMaxY, 5);
  });
});

describe('buildWhiteboardContextV2', () => {
  it('integrates semantic data into structured context', () => {
    const rect = makeRect();
    const semanticScene: SemanticBatch[] = [
      {
        batch_id: 'sb1',
        template: 'freeform_semantic',
        blocks: [
          { id: 'b1', kind: 'caption', text: 'Test caption', region_hint: 'auto' },
        ],
      },
    ];
    const ctx = buildWhiteboardContextV2([rect], semanticScene);
    expect(ctx.scene_summary.element_count).toBe(1);
    expect(ctx.scene_summary.type_counts).toEqual({ rect: 1 });
    expect(ctx.occupied_regions.length).toBeGreaterThan(0);
    expect(ctx.suggested_next_regions.length).toBeGreaterThan(0);
    expect(ctx.token_budget_hint).toHaveProperty('max_chars');
    expect(ctx.recent_blocks.length).toBeGreaterThan(0);
    expect(ctx.recent_blocks[0].text_preview).toBe('Test caption');
  });
});
