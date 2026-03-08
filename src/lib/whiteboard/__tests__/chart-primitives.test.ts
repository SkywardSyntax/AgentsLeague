import { describe, it, expect } from 'vitest';
import type { DrawElement } from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';
import {
  lowerPlannedLayoutToDrawBatch,
  lowerMathPrimitive,
} from '../planner/lowerer';
import { DrawBatchSchema } from '@/lib/schema';
import type { ComparisonChartElement, BoxPlotElement } from '@/types/agent';

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
// comparison_chart
// ===========================================================================
describe('expandComparisonChart', () => {
  const baseSingleSeries: ComparisonChartElement = {
    id: 'cc-1',
    type: 'comparison_chart',
    x: 100,
    y: 50,
    width: 400,
    height: 250,
    categories: ['A', 'B', 'C'],
    series: [{ name: 'Series 1', values: [10, 20, 30] }],
  };

  it('single series, 3 categories → 3 rect strokes', () => {
    const result = lowerMathPrimitive(baseSingleSeries);
    expect(countByType(result, 'rect')).toBe(3);
    expect(hasNoNaN(result)).toBe(true);
  });

  it('multi-series → correct bar count', () => {
    const el: ComparisonChartElement = {
      ...baseSingleSeries,
      id: 'cc-2',
      series: [
        { name: '2023', values: [10, 20, 30] },
        { name: '2024', values: [15, 25, 35] },
      ],
    };
    const result = lowerMathPrimitive(el);
    // 2 series × 3 categories = 6 bars + 2 legend color swatches = 8 rects
    expect(countByType(result, 'rect')).toBe(8);
    expect(hasNoNaN(result)).toBe(true);
  });

  it('produces valid DrawBatch via lowerSingle', () => {
    const batch = lowerSingle(baseSingleSeries);
    const parsed = DrawBatchSchema.safeParse(batch);
    expect(parsed.success).toBe(true);
  });

  it('all coordinates are finite', () => {
    const result = lowerMathPrimitive(baseSingleSeries);
    expect(hasNoNaN(result)).toBe(true);
  });

  it('showValues adds value text elements', () => {
    const el: ComparisonChartElement = {
      ...baseSingleSeries,
      id: 'cc-sv',
      showValues: true,
    };
    const result = lowerMathPrimitive(el);
    // Should have text elements for the 3 value labels
    const textEls = result.filter((e) => e.type === 'text');
    // At minimum: 3 values + category labels + axis labels
    expect(textEls.length).toBeGreaterThanOrEqual(3);
  });
});

// ===========================================================================
// box_plot
// ===========================================================================
describe('expandBoxPlot', () => {
  const baseSingleGroup: BoxPlotElement = {
    id: 'bp-1',
    type: 'box_plot',
    x: 100,
    y: 50,
    width: 400,
    height: 200,
    groups: [
      { label: 'Group A', min: 10, q1: 25, median: 50, q3: 75, max: 90 },
    ],
  };

  it('single group → box rect + whisker lines + median line', () => {
    const result = lowerMathPrimitive(baseSingleGroup);
    // Expect at least 1 rect (box), lines (whiskers + caps + median)
    expect(countByType(result, 'rect')).toBeGreaterThanOrEqual(1);
    expect(countByType(result, 'line')).toBeGreaterThanOrEqual(3); // min whisker, max whisker, median
    expect(hasNoNaN(result)).toBe(true);
  });

  it('with outliers → outlier ellipse strokes', () => {
    const el: BoxPlotElement = {
      ...baseSingleGroup,
      id: 'bp-2',
      groups: [
        { label: 'Group A', min: 10, q1: 25, median: 50, q3: 75, max: 90, outliers: [2, 5, 95] },
      ],
    };
    const result = lowerMathPrimitive(el);
    // 3 outliers → 3 ellipse elements
    expect(countByType(result, 'ellipse')).toBeGreaterThanOrEqual(3);
    expect(hasNoNaN(result)).toBe(true);
  });

  it('produces valid DrawBatch via lowerSingle', () => {
    const batch = lowerSingle(baseSingleGroup);
    const parsed = DrawBatchSchema.safeParse(batch);
    expect(parsed.success).toBe(true);
  });

  it('all coordinates are finite', () => {
    const result = lowerMathPrimitive(baseSingleGroup);
    expect(hasNoNaN(result)).toBe(true);
  });

  it('showMean adds mean marker text', () => {
    const el: BoxPlotElement = {
      ...baseSingleGroup,
      id: 'bp-sm',
      showMean: true,
      groups: [
        { label: 'Group A', min: 10, q1: 25, median: 50, q3: 75, max: 90, mean: 48 },
      ],
    };
    const result = lowerMathPrimitive(el);
    // Should have a text element with × for the mean
    const meanTexts = result.filter(
      (e) => e.type === 'text' && 'text' in e && (e as { text: string }).text === '×'
    );
    expect(meanTexts.length).toBeGreaterThanOrEqual(1);
  });
});
