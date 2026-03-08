import { describe, it, expect } from 'vitest';
import type { DrawElement } from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';
import {
  lowerPlannedLayoutToDrawBatch,
  lowerMathPrimitive,
} from '../planner/lowerer';
import { DrawBatchSchema } from '@/lib/schema';

// Helpers
function makeLayout(elements: DrawElement[]): PlannedSemanticLayout {
  return {
    batchId: 'test-batch',
    stylePreset: 'clean_pen_sketch',
    templateUsed: 'freeform_semantic',
    elements,
    anchors: [],
    semanticBatch: { batch_id: 'test-batch', template: 'freeform_semantic', blocks: [] },
    warnings: [],
  };
}

function lowerSingle(el: DrawElement) {
  const layout = makeLayout([el]);
  return lowerPlannedLayoutToDrawBatch(layout, { maxElements: 200 });
}

function countByType(elements: DrawElement[], type: string) {
  return elements.filter((e) => e.type === type).length;
}

function hasNoNaN(elements: DrawElement[]) {
  const json = JSON.stringify(elements);
  return !json.includes('NaN') && !json.includes('null');
}

// ---------------------------------------------------------------------------
// probability_tree tests
// ---------------------------------------------------------------------------

describe('expandProbabilityTree', () => {
  const twoLevelTree: DrawElement = {
    id: 'pt-1',
    type: 'probability_tree',
    x: 100,
    y: 300,
    rootLabel: 'Coin',
    branches: [
      {
        label: 'H',
        probability: 0.5,
        children: [
          { label: 'H', probability: 0.5 },
          { label: 'T', probability: 0.5 },
        ],
      },
      {
        label: 'T',
        probability: 0.5,
        children: [
          { label: 'H', probability: 0.5 },
          { label: 'T', probability: 0.5 },
        ],
      },
    ],
  };

  it('2-level tree produces correct line and text counts', () => {
    const batch = lowerSingle(twoLevelTree);
    expect(batch.elements.length).toBeGreaterThan(0);

    // 2 branches from root (2 lines) + 2×2=4 child edges = 6 lines total
    const lines = countByType(batch.elements, 'line');
    expect(lines).toBe(6);

    // root label + 2 branch prob labels + 2 branch labels
    // + 4 child prob labels + 4 child labels + 4 final prob labels = 17 texts
    const texts = countByType(batch.elements, 'text');
    expect(texts).toBeGreaterThanOrEqual(15);
  });

  it('leaf node probabilities multiply correctly', () => {
    const batch = lowerSingle(twoLevelTree);
    // Find final probability labels: should contain "P=1/4" (0.5 × 0.5 = 0.25 = 1/4)
    const fpTexts = batch.elements.filter(
      (e) => e.type === 'text' && 'text' in e && (e as { text: string }).text.includes('P ='),
    );
    expect(fpTexts.length).toBe(4); // 4 leaf nodes
    for (const t of fpTexts) {
      expect((t as { text: string }).text).toBe('P = 1/4');
    }
  });

  it('validates via DrawBatchSchema.safeParse', () => {
    const batch = lowerSingle(twoLevelTree);
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('lowers without NaN coordinates', () => {
    const batch = lowerSingle(twoLevelTree);
    expect(hasNoNaN(batch.elements)).toBe(true);
  });

  it('works via lowerMathPrimitive directly', () => {
    const lowered = lowerMathPrimitive(twoLevelTree as Parameters<typeof lowerMathPrimitive>[0]);
    expect(lowered.length).toBeGreaterThan(0);
    expect(countByType(lowered, 'line')).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// scatter_plot tests
// ---------------------------------------------------------------------------

describe('expandScatterPlot', () => {
  const fivePointPlot: DrawElement = {
    id: 'sp-1',
    type: 'scatter_plot',
    x: 100,
    y: 50,
    width: 400,
    height: 300,
    points: [
      { x: 1, y: 2 },
      { x: 2, y: 4.1 },
      { x: 3, y: 5.8 },
      { x: 4, y: 8.2 },
      { x: 5, y: 9.7 },
    ],
    xLabel: 'X',
    yLabel: 'Y',
  };

  it('5 points produce 5 circle strokes + axes', () => {
    const batch = lowerSingle(fivePointPlot);
    expect(batch.elements.length).toBeGreaterThan(0);

    // 5 data point ellipses
    const ellipses = countByType(batch.elements, 'ellipse');
    expect(ellipses).toBe(5);

    // 2 axis lines + tick lines
    const lines = countByType(batch.elements, 'line');
    expect(lines).toBeGreaterThanOrEqual(2);
  });

  it('with regression includes regression line stroke', () => {
    const withRegression: DrawElement = {
      ...fivePointPlot,
      showRegressionLine: true,
    } as DrawElement;

    const batch = lowerSingle(withRegression);
    const lines = batch.elements.filter((e) => e.type === 'line');

    // Should include the regression line
    const regLine = batch.elements.find((e) => e.id === 'sp-1-regression-line');
    expect(regLine).toBeDefined();
    expect(regLine!.type).toBe('line');

    // Should include R² text
    const r2Text = batch.elements.find((e) => e.id === 'sp-1-r2-label');
    expect(r2Text).toBeDefined();
    expect(r2Text!.type).toBe('text');
  });

  it('validates via DrawBatchSchema.safeParse', () => {
    const batch = lowerSingle(fivePointPlot);
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('lowers without NaN coordinates', () => {
    const batch = lowerSingle(fivePointPlot);
    expect(hasNoNaN(batch.elements)).toBe(true);
  });

  it('works via lowerMathPrimitive directly', () => {
    const lowered = lowerMathPrimitive(fivePointPlot as Parameters<typeof lowerMathPrimitive>[0]);
    expect(lowered.length).toBeGreaterThan(0);
    expect(countByType(lowered, 'ellipse')).toBe(5);
  });
});
