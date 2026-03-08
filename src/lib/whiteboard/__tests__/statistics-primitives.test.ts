import { describe, it, expect } from 'vitest';
import type { DrawElement } from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';
import {
  lowerPlannedLayoutToDrawBatch,
  lowerMathPrimitive,
} from '../planner/lowerer';
import { DrawBatchSchema } from '@/lib/schema';
import type { HistogramElement, NormalDistributionCurveElement } from '@/types/agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  return lowerPlannedLayoutToDrawBatch(layout, { maxElements: 500 });
}

function countByType(elements: DrawElement[], type: string) {
  return elements.filter((e) => e.type === type).length;
}

function hasNoNaN(elements: DrawElement[]) {
  const json = JSON.stringify(elements);
  return !json.includes('NaN') && !json.includes('null');
}

// ===========================================================================
// histogram
// ===========================================================================
describe('expandHistogram', () => {
  const baseHistogram: HistogramElement = {
    id: 'hist-1',
    type: 'histogram',
    x: 100,
    y: 50,
    width: 500,
    height: 300,
    bins: [
      { label: 'A', value: 15 },
      { label: 'B', value: 25 },
      { label: 'C', value: 10 },
    ],
  };

  it('3 bins → 3 rect elements + 3 text elements (values) + 3 labels', () => {
    const result = lowerMathPrimitive(baseHistogram);
    const rects = result.filter((e) => e.type === 'rect');
    const texts = result.filter((e) => e.type === 'text');
    expect(rects.length).toBe(3);
    // 3 value labels + 3 bin labels + y-axis tick labels (6) = at least 9
    expect(texts.length).toBeGreaterThanOrEqual(6);
  });

  it('produces finite coordinates', () => {
    const result = lowerMathPrimitive(baseHistogram);
    expect(hasNoNaN(result)).toBe(true);
  });

  it('validates via DrawBatchSchema.safeParse', () => {
    const batch = lowerSingle(baseHistogram);
    const parsed = DrawBatchSchema.safeParse(batch);
    expect(parsed.success).toBe(true);
  });

  it('respects showValues=false', () => {
    const noValues: HistogramElement = { ...baseHistogram, showValues: false };
    const result = lowerMathPrimitive(noValues);
    const valueTexts = result.filter(
      (e) => e.type === 'text' && e.id.includes('-val-'),
    );
    expect(valueTexts.length).toBe(0);
  });

  it('respects showAxes=false', () => {
    const noAxes: HistogramElement = { ...baseHistogram, showAxes: false };
    const result = lowerMathPrimitive(noAxes);
    const axisLines = result.filter(
      (e) => e.type === 'line' && (e.id.includes('-x-axis') || e.id.includes('-y-axis')),
    );
    expect(axisLines.length).toBe(0);
  });

  it('applies custom bar colors', () => {
    const colored: HistogramElement = {
      ...baseHistogram,
      bins: [
        { label: 'A', value: 10, color: '#ff0000' },
        { label: 'B', value: 20, color: '#00ff00' },
        { label: 'C', value: 5, color: '#0000ff' },
      ],
    };
    const result = lowerMathPrimitive(colored);
    const rects = result.filter((e) => e.type === 'rect');
    expect(rects[0]!.color).toBe('#ff0000');
    expect(rects[1]!.color).toBe('#00ff00');
    expect(rects[2]!.color).toBe('#0000ff');
  });
});

// ===========================================================================
// normal_distribution
// ===========================================================================
describe('expandNormalDistribution', () => {
  const baseNormal: NormalDistributionCurveElement = {
    id: 'norm-1',
    type: 'normal_distribution',
    x: 100,
    y: 50,
    width: 600,
    height: 300,
    mu: 0,
    sigma: 1,
  };

  it('produces line segments for the curve', () => {
    const result = lowerMathPrimitive(baseNormal);
    const lines = result.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThan(100);
  });

  it('produces finite coordinates', () => {
    const result = lowerMathPrimitive(baseNormal);
    expect(hasNoNaN(result)).toBe(true);
  });

  it('validates via DrawBatchSchema.safeParse', () => {
    const batch = lowerSingle(baseNormal);
    const parsed = DrawBatchSchema.safeParse(batch);
    expect(parsed.success).toBe(true);
  });

  it('includes shading elements when shadeFrom/shadeTo specified', () => {
    const shaded: NormalDistributionCurveElement = {
      ...baseNormal,
      shadeFrom: -1,
      shadeTo: 1,
    };
    const result = lowerMathPrimitive(shaded);
    const shadeLines = result.filter((e) => e.id.includes('-shade-'));
    expect(shadeLines.length).toBeGreaterThan(0);
  });

  it('includes mean line by default', () => {
    const result = lowerMathPrimitive(baseNormal);
    const meanLine = result.filter((e) => e.id.includes('-mean'));
    expect(meanLine.length).toBe(1);
  });

  it('includes sigma lines when showSigmaLines=true', () => {
    const withSigma: NormalDistributionCurveElement = {
      ...baseNormal,
      showSigmaLines: true,
    };
    const result = lowerMathPrimitive(withSigma);
    const sigmaLines = result.filter((e) => e.id.includes('-sigma-'));
    expect(sigmaLines.length).toBe(4); // ±1σ and ±2σ
  });

  it('includes labels when showLabels=true', () => {
    const withLabels: NormalDistributionCurveElement = {
      ...baseNormal,
      showLabels: true,
    };
    const result = lowerMathPrimitive(withLabels);
    const labels = result.filter((e) => e.type === 'text' && e.id.includes('-label'));
    expect(labels.length).toBeGreaterThanOrEqual(5); // μ + μ±σ + μ±2σ
  });

  it('handles non-standard mu and sigma', () => {
    const custom: NormalDistributionCurveElement = {
      ...baseNormal,
      mu: 100,
      sigma: 15,
    };
    const result = lowerMathPrimitive(custom);
    const lines = result.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThan(100);
    expect(hasNoNaN(result)).toBe(true);
  });
});
