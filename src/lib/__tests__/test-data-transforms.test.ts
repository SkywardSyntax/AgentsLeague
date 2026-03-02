import { describe, expect, it } from 'vitest';
import {
  DrawBatchSchema,
  SemanticBatchSchema,
  DrawElementSchema,
  normalizeDrawBatchPayload,
  normalizeSemanticBatchPayload,
} from '@/lib/schema';
import type { DrawBatch, DrawElement, SemanticBatch, ChatMessage, StrokeTrajectory, Point, RectElement } from '@/types/agent';

function buildDrawElement(overrides?: Partial<RectElement>): DrawElement {
  return { type: 'rect', id: 'el-1', x: 0, y: 0, w: 100, h: 50, ...overrides } as DrawElement;
}

function buildDrawBatch(overrides?: Partial<DrawBatch>): DrawBatch {
  return { batch_id: 'batch-1', elements: [buildDrawElement()], ...overrides };
}

function buildSemanticBatch(overrides?: Partial<SemanticBatch>): SemanticBatch {
  return {
    batch_id: 'sbatch-1',
    template: 'equation_derivation_vertical',
    blocks: [{ id: 'block-1', kind: 'equation_stack', lines: [{ id: 'line-1', tex: 'x^2' }] }],
    ...overrides,
  };
}

function buildChatMessage(overrides?: Partial<ChatMessage>): ChatMessage {
  return { id: 'msg-1', role: 'user', content: 'Hello', createdAt: Date.now(), ...overrides };
}

function buildStrokeTrajectory(overrides?: Partial<StrokeTrajectory>): StrokeTrajectory {
  return {
    id: 'stroke-1', elementId: 'el-1',
    points: Array.from({ length: 5 }, (_, i) => ({ x: i * 10, y: i * 10 })),
    color: '#000000', baseWidth: 2, ...overrides,
  };
}

function buildPoints(count: number, opts?: { spread?: number }): Point[] {
  const spread = opts?.spread ?? 10;
  return Array.from({ length: count }, (_, i) => ({ x: i * spread, y: i * spread }));
}

describe('iter28 · Test data transforms — factory/builder schema validity', () => {
  it('buildDrawElement() produces valid DrawElement per DrawElementSchema', () => {
    const el = buildDrawElement();
    const result = DrawElementSchema.safeParse(el);
    expect(result.success).toBe(true);
  });

  it('buildDrawBatch() produces valid DrawBatch per DrawBatchSchema', () => {
    const batch = buildDrawBatch();
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('buildSemanticBatch() produces valid SemanticBatch per SemanticBatchSchema', () => {
    const batch = buildSemanticBatch();
    const result = SemanticBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('buildChatMessage() produces valid ChatMessage with all required fields', () => {
    const msg = buildChatMessage();
    expect(msg.id).toBeTruthy();
    expect(['user', 'assistant', 'system']).toContain(msg.role);
    expect(typeof msg.content).toBe('string');
    expect(typeof msg.createdAt).toBe('number');
  });

  it('buildStrokeTrajectory() produces valid StrokeTrajectory with 5 points', () => {
    const stroke = buildStrokeTrajectory();
    expect(stroke.id).toBeTruthy();
    expect(stroke.elementId).toBeTruthy();
    expect(stroke.points).toHaveLength(5);
    expect(typeof stroke.color).toBe('string');
    expect(typeof stroke.baseWidth).toBe('number');
    stroke.points.forEach(p => {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
    });
  });

  it('DrawBatch with explicit style validates per schema', () => {
    const batch = buildDrawBatch({ batch_id: 'test-batch', style_preset: 'blueprint_neat' });
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
    expect(batch.batch_id).toBe('test-batch');
    expect(batch.style_preset).toBe('blueprint_neat');
  });

  it('SemanticBatch with equation_stack validates per schema', () => {
    const batch = buildSemanticBatch({
      blocks: [{
        id: 'eq-1', kind: 'equation_stack',
        lines: [
          { id: 'l1', tex: 'x^2' },
          { id: 'l2', tex: '2x' },
          { id: 'l3', tex: '1' },
        ],
      }],
    });
    const result = SemanticBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
    if (batch.blocks[0]!.kind === 'equation_stack') {
      expect(batch.blocks[0]!.lines).toHaveLength(3);
    }
  });

  it('SemanticBatch with diagram_panel validates per schema', () => {
    const batch: SemanticBatch = {
      batch_id: 'sb-panel',
      template: 'freeform_semantic',
      blocks: [{
        id: 'dp-1', kind: 'diagram_panel',
        shapes: Array.from({ length: 4 }, (_, i) => ({
          id: `shape-${i}`, type: 'rect' as const, label: `Shape ${i}`,
        })),
      }],
    };
    const result = SemanticBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
    if (batch.blocks[0]!.kind === 'diagram_panel') {
      expect(batch.blocks[0]!.shapes).toHaveLength(4);
    }
  });

  it('buildDrawElement with partial overrides preserves type discrimination', () => {
    const el = buildDrawElement({ x: 42, y: 99 });
    expect(el.type).toBe('rect');
    if (el.type === 'rect') {
      expect(el.x).toBe(42);
      expect(el.y).toBe(99);
      expect(el.w).toBe(100);
      expect(el.h).toBe(50);
    }
    const result = DrawElementSchema.safeParse(el);
    expect(result.success).toBe(true);
  });

  it('buildPoints generates correct count with expected spread', () => {
    const points = buildPoints(4, { spread: 25 });
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[1]).toEqual({ x: 25, y: 25 });
    expect(points[2]).toEqual({ x: 50, y: 50 });
    expect(points[3]).toEqual({ x: 75, y: 75 });
  });
});
