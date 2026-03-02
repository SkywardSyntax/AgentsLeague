import { describe, it, expect } from 'vitest';
import {
  DrawBatchSchema,
  SemanticBatchSchema,
  AgentStreamRequestSchema,
  normalizeDrawBatchPayload,
  normalizeSemanticBatchPayload,
} from '@/lib/schema';

describe('Route↔Client contract', () => {
  it('minimal valid AgentStreamRequest passes schema validation', () => {
    const request = {
      sessionId: 'sess-1',
      userMessage: 'Hello',
      history: [],
    };
    const result = AgentStreamRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it('AgentStreamRequest with whiteboardContext passes validation', () => {
    const request = {
      sessionId: 'sess-1',
      userMessage: 'Draw something',
      history: [],
      whiteboardContext: {
        elementCount: 0,
        elementTypeCounts: {},
        recentElements: [],
        suggestedNextOrigin: { x: 64, y: 96 },
      },
    };
    const result = AgentStreamRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it('AgentStreamRequest with whiteboardContextV2 passes validation', () => {
    const request = {
      sessionId: 'sess-1',
      userMessage: 'Draw',
      history: [],
      whiteboardContextV2: {
        scene_summary: { element_count: 0, type_counts: {} },
        occupied_regions: [],
        anchors: [],
        recent_blocks: [],
        suggested_next_regions: [
          { name: 'below_full', x: 64, y: 96, w: 1320, h: 420, score: 1 },
        ],
        token_budget_hint: { max_chars: 2200 },
      },
    };
    const result = AgentStreamRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it('DrawBatch with all element types passes DrawBatchSchema', () => {
    const batch = {
      batch_id: 'full-1',
      elements: [
        { id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50 },
        { id: 'e1', type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 },
        { id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 100 } },
        { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
        { id: 't1', type: 'text', x: 10, y: 10, text: 'Hello' },
        { id: 'x1', type: 'latex', x: 10, y: 10, tex: 'x^2' },
        { id: 'c1', type: 'clear' },
      ],
    };
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('SemanticBatch with equation_stack passes SemanticBatchSchema', () => {
    const batch = {
      batch_id: 'sb-eq-1',
      template: 'equation_derivation_vertical',
      blocks: [{
        id: 'eq1', kind: 'equation_stack',
        lines: [{ id: 'l1', tex: 'E=mc^2' }],
      }],
    };
    const result = SemanticBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('SemanticBatch with diagram_panel passes SemanticBatchSchema', () => {
    const batch = {
      batch_id: 'sb-dp-1',
      template: 'jacobian_mapping_2panel',
      blocks: [{
        id: 'dp1', kind: 'diagram_panel',
        axes: { x_label: 'x', y_label: 'y' },
      }],
    };
    const result = SemanticBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('SemanticBatch with caption passes SemanticBatchSchema', () => {
    const batch = {
      batch_id: 'sb-cap-1',
      template: 'freeform_semantic',
      blocks: [{ id: 'cap1', kind: 'caption', text: 'Summary' }],
    };
    const result = SemanticBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('normalizeDrawBatchPayload with width/height aliases produces valid batch', () => {
    const raw = {
      batch_id: 'alias-1',
      elements: [
        { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 50 },
      ],
    };
    const { normalized, warnings } = normalizeDrawBatchPayload(raw);
    expect(normalized).not.toBeNull();
    const valid = DrawBatchSchema.safeParse(normalized);
    expect(valid.success).toBe(true);
  });

  it('normalizeSemanticBatchPayload with invalid template defaults to freeform', () => {
    const raw = {
      batch_id: 'template-bad',
      template: 'nonexistent_template',
      blocks: [{ id: 'cap1', kind: 'caption', text: 'Note' }],
    };
    const { normalized, warnings } = normalizeSemanticBatchPayload(raw);
    expect(normalized).not.toBeNull();
    expect(normalized!.template).toBe('freeform_semantic');
    expect(warnings.some((w) => w.includes('template'))).toBe(true);
  });

  it('normalizeDrawBatchPayload rejects non-object payload with warning', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload('not an object');
    expect(normalized).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });
});
