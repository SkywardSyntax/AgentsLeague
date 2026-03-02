import { describe, expect, it } from 'vitest';
import {
  fromLegacyDrawBatchToSemanticStub,
  DEFAULT_PLANNER_CONFIG,
} from '@/lib/whiteboard/planner';
import { SemanticBatchSchema } from '@/lib/schema';
import type { DrawElement } from '@/types/agent';

function makeRect(id: string): DrawElement {
  return { type: 'rect', id, x: 0, y: 0, w: 100, h: 50 };
}

describe('fromLegacyDrawBatchToSemanticStub', () => {
  const elements: DrawElement[] = [
    makeRect('r1'),
    makeRect('r2'),
    makeRect('r3'),
    makeRect('r4'),
    makeRect('r5'),
  ];

  const result = fromLegacyDrawBatchToSemanticStub('imported-batch1', elements);

  it('returns valid SemanticBatch shape', () => {
    expect(result).toHaveProperty('batch_id');
    expect(result).toHaveProperty('template');
    expect(result).toHaveProperty('intent');
    expect(result).toHaveProperty('blocks');
    expect(Array.isArray(result.blocks)).toBe(true);
  });

  it('batch_id starts with "imported-"', () => {
    expect(result.batch_id.startsWith('imported-')).toBe(true);
  });

  it('template is "freeform_semantic"', () => {
    expect(result.template).toBe('freeform_semantic');
  });

  it('intent is "summarize"', () => {
    expect(result.intent).toBe('summarize');
  });

  it('blocks has exactly one block', () => {
    expect(result.blocks).toHaveLength(1);
  });

  it('block is kind "caption"', () => {
    expect(result.blocks[0].kind).toBe('caption');
  });

  it('caption text includes element count', () => {
    expect(result.blocks[0].kind === 'caption' && result.blocks[0].text).toContain('5');
  });

  it('caption region_hint is "bottom"', () => {
    const block = result.blocks[0] as { region_hint?: string };
    expect(block.region_hint).toBe('bottom');
  });

  it('result passes SemanticBatchSchema validation', () => {
    const parsed = SemanticBatchSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe('DEFAULT_PLANNER_CONFIG', () => {
  it('has expected canvas dimensions', () => {
    expect(DEFAULT_PLANNER_CONFIG.canvasWidth).toBe(1600);
    expect(DEFAULT_PLANNER_CONFIG.canvasHeight).toBe(1200);
  });

  it('has expected margins and gaps', () => {
    expect(DEFAULT_PLANNER_CONFIG.margin).toBe(24);
    expect(DEFAULT_PLANNER_CONFIG.maxRepairIterations).toBe(3);
    expect(DEFAULT_PLANNER_CONFIG.minTextGap).toBe(14);
    expect(DEFAULT_PLANNER_CONFIG.minLabelGap).toBe(10);
    expect(DEFAULT_PLANNER_CONFIG.maxScaleDownPerBlock).toBe(0.15);
  });
});
