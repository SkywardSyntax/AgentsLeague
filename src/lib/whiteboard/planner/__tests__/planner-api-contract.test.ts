import { describe, it, expect } from 'vitest';
import {
  planSemanticBatch,
  fromLegacyDrawBatchToSemanticStub,
  enforceDrawBatchConstraints,
  lowerPlannedLayoutToDrawBatch,
  buildStructuredWhiteboardContext,
  extendStructuredWhiteboardContext,
  DEFAULT_PLANNER_CONFIG,
} from '@/lib/whiteboard/planner';
import { createPlanQueue } from '@/lib/whiteboard/planner/plan-queue';
import type { PlannedSemanticLayout, PlannerConfig } from '@/lib/whiteboard/planner/types';

describe('Lane 02 — Planner API Contract', () => {
  it('planSemanticBatch is an exported function', () => {
    expect(typeof planSemanticBatch).toBe('function');
  });

  it('fromLegacyDrawBatchToSemanticStub is an exported function', () => {
    expect(typeof fromLegacyDrawBatchToSemanticStub).toBe('function');
  });

  it('enforceDrawBatchConstraints is an exported function', () => {
    expect(typeof enforceDrawBatchConstraints).toBe('function');
  });

  it('lowerPlannedLayoutToDrawBatch is an exported function', () => {
    expect(typeof lowerPlannedLayoutToDrawBatch).toBe('function');
  });

  it('buildStructuredWhiteboardContext is an exported function', () => {
    expect(typeof buildStructuredWhiteboardContext).toBe('function');
  });

  it('extendStructuredWhiteboardContext is an exported function', () => {
    expect(typeof extendStructuredWhiteboardContext).toBe('function');
  });

  it('PlannedSemanticLayout type shape keys are stable', () => {
    const keys: (keyof PlannedSemanticLayout)[] = [
      'batchId',
      'stylePreset',
      'templateUsed',
      'elements',
      'anchors',
      'semanticBatch',
      'warnings',
    ];
    expect(keys.sort()).toMatchInlineSnapshot(`
      [
        "anchors",
        "batchId",
        "elements",
        "semanticBatch",
        "stylePreset",
        "templateUsed",
        "warnings",
      ]
    `);
  });

  it('DEFAULT_PLANNER_CONFIG shape and values are stable', () => {
    expect(DEFAULT_PLANNER_CONFIG).toMatchInlineSnapshot(`
      {
        "canvasHeight": 1200,
        "canvasWidth": 1600,
        "margin": 24,
        "maxRepairIterations": 6,
        "maxScaleDownPerBlock": 0.15,
        "minLabelGap": 10,
        "minTextGap": 14,
      }
    `);
  });

  it('PlannerConfig interface has all expected keys', () => {
    const configKeys: (keyof PlannerConfig)[] = [
      'canvasWidth',
      'canvasHeight',
      'margin',
      'maxRepairIterations',
      'minTextGap',
      'minLabelGap',
      'maxScaleDownPerBlock',
    ];
    expect(configKeys.sort()).toMatchInlineSnapshot(`
      [
        "canvasHeight",
        "canvasWidth",
        "margin",
        "maxRepairIterations",
        "maxScaleDownPerBlock",
        "minLabelGap",
        "minTextGap",
      ]
    `);
  });

  it('PlanQueue API surface has enqueue, isPlanning, cancel', () => {
    const queue = createPlanQueue<string>();
    expect(Object.keys(queue).sort()).toMatchInlineSnapshot(`
      [
        "cancel",
        "enqueue",
        "isPlanning",
      ]
    `);
    expect(typeof queue.enqueue).toBe('function');
    expect(typeof queue.isPlanning).toBe('function');
    expect(typeof queue.cancel).toBe('function');
  });
});
