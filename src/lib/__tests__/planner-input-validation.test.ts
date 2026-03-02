import { describe, it, expect } from 'vitest';
import { validateSemanticBatchInput } from '@/lib/whiteboard/planner/validate-input';
import type { SemanticBatch, SemanticBlock, SemanticRelation } from '@/types/agent';

function makeCaption(id: string, text: string): SemanticBlock {
  return { id, kind: 'caption', text, region_hint: 'bottom' };
}

function makeEquationStack(
  id: string,
  lines: Array<{ id: string; tex: string }>,
): SemanticBlock {
  return {
    id,
    kind: 'equation_stack',
    lines: lines.map((l) => ({ id: l.id, tex: l.tex })),
  };
}

function makeRelation(from: string, to: string, id = `rel-${from}-${to}`): SemanticRelation {
  return { id, type: 'explains', from_block_id: from, to_block_id: to };
}

function makeBatch(overrides: Partial<SemanticBatch> = {}): SemanticBatch {
  return {
    batch_id: 'test-batch-1',
    template: 'freeform_semantic',
    blocks: [
      makeCaption('block-a', 'Hello world'),
      makeEquationStack('block-b', [{ id: 'line-1', tex: 'x^2 + 1' }]),
    ],
    relations: [makeRelation('block-a', 'block-b')],
    ...overrides,
  };
}

describe('Planner Input Validation — validateSemanticBatchInput', () => {
  it('valid batch passes through unchanged', () => {
    const input = makeBatch();
    const { valid, repaired, warnings } = validateSemanticBatchInput(input);
    expect(valid).toBe(true);
    expect(warnings).toHaveLength(0);
    expect(repaired.batch_id).toBe(input.batch_id);
    expect(repaired.blocks).toHaveLength(2);
    expect(repaired.relations).toHaveLength(1);
  });

  it('empty batch_id gets auto-generated', () => {
    const { valid, repaired, warnings } = validateSemanticBatchInput(
      makeBatch({ batch_id: '' }),
    );
    expect(valid).toBe(false);
    expect(repaired.batch_id).toBeTruthy();
    expect(repaired.batch_id.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.toLowerCase().includes('batch_id'))).toBe(true);
  });

  it('duplicate block IDs are deduplicated', () => {
    const blocks: SemanticBlock[] = [
      makeCaption('block-1', 'First'),
      makeCaption('block-1', 'Second'),
      makeCaption('block-1', 'Third'),
    ];
    const { valid, repaired, warnings } = validateSemanticBatchInput(
      makeBatch({ blocks, relations: [] }),
    );
    expect(valid).toBe(false);
    const ids = repaired.blocks.map((b) => b.id);
    expect(ids).toEqual(['block-1', 'block-1-dup-1', 'block-1-dup-2']);
    expect(warnings.some((w) => w.toLowerCase().includes('duplicate'))).toBe(true);
  });

  it('self-referencing relation is removed', () => {
    const selfRef: SemanticRelation = {
      id: 'rel-self',
      type: 'explains',
      from_block_id: 'block-a',
      to_block_id: 'block-a',
    };
    const { valid, repaired, warnings } = validateSemanticBatchInput(
      makeBatch({ relations: [selfRef] }),
    );
    expect(valid).toBe(false);
    expect(repaired.relations).toHaveLength(0);
    expect(warnings.some((w) => w.toLowerCase().includes('self-referenc'))).toBe(true);
  });

  it('whitespace-only caption text is stripped', () => {
    const blocks: SemanticBlock[] = [
      makeCaption('cap-ws', '   '),
      makeCaption('cap-ok', 'Valid text'),
    ];
    const { valid, repaired, warnings } = validateSemanticBatchInput(
      makeBatch({ blocks, relations: [] }),
    );
    expect(valid).toBe(false);
    expect(repaired.blocks).toHaveLength(1);
    expect(repaired.blocks[0]!.id).toBe('cap-ok');
    expect(warnings.some((w) => w.includes('whitespace'))).toBe(true);
  });

  it('whitespace-only equation tex lines are stripped', () => {
    const eq = makeEquationStack('eq-1', [
      { id: 'l1', tex: '  \n  ' },
      { id: 'l2', tex: 'E = mc^2' },
    ]);
    const { valid, repaired, warnings } = validateSemanticBatchInput(
      makeBatch({ blocks: [eq], relations: [] }),
    );
    expect(valid).toBe(false);
    expect(repaired.blocks).toHaveLength(1);
    const eqBlock = repaired.blocks[0] as { kind: string; lines: Array<{ tex: string }> };
    expect(eqBlock.lines).toHaveLength(1);
    expect(eqBlock.lines[0]!.tex).toBe('E = mc^2');
    expect(warnings.some((w) => w.includes('whitespace'))).toBe(true);
  });

  it('equation_stack with ALL whitespace lines is removed entirely', () => {
    const eq = makeEquationStack('eq-all-ws', [
      { id: 'l1', tex: ' ' },
      { id: 'l2', tex: '   ' },
    ]);
    const { valid, repaired, warnings } = validateSemanticBatchInput(
      makeBatch({ blocks: [eq], relations: [] }),
    );
    expect(valid).toBe(false);
    expect(repaired.blocks).toHaveLength(0);
    expect(warnings.some((w) => w.includes('all lines are whitespace'))).toBe(true);
  });

  it('blocks beyond MAX_BLOCKS (8) are truncated', () => {
    const blocks: SemanticBlock[] = Array.from({ length: 12 }, (_, i) =>
      makeCaption(`b-${i}`, `Block ${i}`),
    );
    const { valid, repaired, warnings } = validateSemanticBatchInput(
      makeBatch({ blocks, relations: [] }),
    );
    expect(valid).toBe(false);
    expect(repaired.blocks).toHaveLength(8);
    expect(warnings.some((w) => w.toLowerCase().includes('truncat'))).toBe(true);
  });

  it('relation referencing a removed block is dropped', () => {
    const blocks: SemanticBlock[] = [
      makeCaption('block-a', 'Valid'),
      makeCaption('block-b', '   '), // will be removed (whitespace-only)
    ];
    const relations: SemanticRelation[] = [makeRelation('block-a', 'block-b')];
    const { valid, repaired, warnings } = validateSemanticBatchInput(
      makeBatch({ blocks, relations }),
    );
    expect(valid).toBe(false);
    expect(repaired.relations).toHaveLength(0);
    expect(warnings.some((w) => w.includes('block-b') && w.includes('does not exist'))).toBe(true);
  });

  it('relation with non-existent from_block_id is dropped', () => {
    const relations: SemanticRelation[] = [makeRelation('nonexistent', 'block-a')];
    const { valid, repaired, warnings } = validateSemanticBatchInput(
      makeBatch({ relations }),
    );
    expect(valid).toBe(false);
    expect(repaired.relations).toHaveLength(0);
    expect(warnings.some((w) => w.includes('nonexistent') && w.includes('does not exist'))).toBe(true);
  });
});
