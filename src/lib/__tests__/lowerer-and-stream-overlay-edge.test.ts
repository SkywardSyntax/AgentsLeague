import { describe, it, expect } from 'vitest';
import { lowerPlannedLayoutToDrawBatch } from '../whiteboard/planner/lowerer';
import {
  extractStreamStepLines,
  toStreamTextKey,
  toStreamLatexKey,
} from '../whiteboard/stream-overlay';
import type { PlannedSemanticLayout } from '../whiteboard/planner/types';
import type { DrawElement, SemanticBatch } from '@/types/agent';

function makeLayout(overrides: Partial<PlannedSemanticLayout> = {}): PlannedSemanticLayout {
  const elements: DrawElement[] = overrides.elements ?? [
    { id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50 },
  ];
  return {
    batchId: 'batch-1',
    stylePreset: 'clean_pen_sketch',
    templateUsed: 'freeform_semantic',
    elements,
    anchors: [],
    semanticBatch: { batch_id: 'sb-1', template: 'freeform_semantic', blocks: [] } as SemanticBatch,
    warnings: [],
    ...overrides,
  };
}

describe('lowerPlannedLayoutToDrawBatch', () => {
  it('maps batchId to batch_id', () => {
    const layout = makeLayout({ batchId: 'my-batch-42' });
    const result = lowerPlannedLayoutToDrawBatch(layout);
    expect(result.batch_id).toBe('my-batch-42');
  });

  it('maps stylePreset to style_preset', () => {
    const layout = makeLayout({ stylePreset: 'rough_sketch' });
    const result = lowerPlannedLayoutToDrawBatch(layout);
    expect(result.style_preset).toBe('rough_sketch');
  });

  it('passes elements through dedup, validation, and sort (not by reference)', () => {
    const elements: DrawElement[] = [
      { id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10 },
    ];
    const layout = makeLayout({ elements });
    const result = lowerPlannedLayoutToDrawBatch(layout);
    expect(result.elements).toEqual(elements);
  });

  it('does NOT include anchors, warnings, semanticBatch in output', () => {
    const layout = makeLayout({ warnings: ['some warning'], anchors: [{ id: 'a1', point: { x: 0, y: 0 }, role: 'top' }] });
    const result = lowerPlannedLayoutToDrawBatch(layout);
    const keys = Object.keys(result);
    expect(keys).toContain('batch_id');
    expect(keys).toContain('style_preset');
    expect(keys).toContain('elements');
    expect(keys).not.toContain('anchors');
    expect(keys).not.toContain('warnings');
    expect(keys).not.toContain('semanticBatch');
    expect(keys).toHaveLength(3);
  });
});

describe('extractStreamStepLines', () => {
  it('drops last line when no trailing newline', () => {
    const result = extractStreamStepLines('1) Step one\n2) Step two');
    expect(result).toEqual(['1) Step one']);
  });

  it('includes all lines with trailing newline', () => {
    const result = extractStreamStepLines('1) Step one\n2) Step two\n');
    expect(result).toEqual(['1) Step one', '2) Step two']);
  });

  it('excludes lines with LaTeX commands', () => {
    const result = extractStreamStepLines('1) \\frac{a}{b}\n2) Normal step\n');
    expect(result).toEqual(['2) Normal step']);
  });

  it('returns max 8 lines', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `${i + 1}) Step ${i + 1}`).join('\n') + '\n';
    const result = extractStreamStepLines(lines);
    expect(result).toHaveLength(8);
    // Should keep the last 8
    expect(result[0]).toBe('5) Step 5');
    expect(result[7]).toBe('12) Step 12');
  });

  it('recognizes all step line patterns', () => {
    const content = [
      'Step 3: foo',
      '- bullet',
      '* star',
      'Therefore result',
      'Label:',
      '',
    ].join('\n');
    const result = extractStreamStepLines(content);
    expect(result).toContain('Step 3: foo');
    expect(result).toContain('- bullet');
    expect(result).toContain('* star');
    expect(result).toContain('Therefore result');
    expect(result).toContain('Label:');
  });
});

describe('toStreamTextKey', () => {
  it('normalizes whitespace and lowercases', () => {
    expect(toStreamTextKey('  Hello  World  ')).toBe('text:hello world');
  });
});

describe('toStreamLatexKey', () => {
  it('normalizes whitespace but preserves case', () => {
    expect(toStreamLatexKey('  x^2  +  y^2  ')).toBe('latex:x^2 + y^2');
  });
});
