import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DrawBatch, StrokeTrajectory } from '@/types/agent';

type CompileResult = { strokes: StrokeTrajectory[]; warnings: string[]; clear: boolean };

const mockCompile = vi.fn<(batch: DrawBatch) => Promise<CompileResult>>();

vi.mock('@/lib/whiteboard/semantic-to-strokes', () => ({
  compileBatchToStrokes: (...args: [DrawBatch]) => mockCompile(...args),
}));

function makeBatch(id: string): DrawBatch {
  return { batch_id: id, elements: [] };
}

/**
 * Simulates the WhiteboardCanvas process() loop with try/catch resilience.
 * This mirrors the actual component logic so we can unit-test it
 * without rendering a React component.
 */
async function processLoop(
  batches: DrawBatch[],
  processedIds: Set<string>,
  warnings: string[],
) {
  const results: { strokes: StrokeTrajectory[]; clear: boolean }[] = [];

  for (const batch of batches) {
    if (processedIds.has(batch.batch_id)) continue;
    processedIds.add(batch.batch_id);

    let compiled;
    try {
      compiled = await mockCompile(batch);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to compile batch ${batch.batch_id}: ${msg}`);
      continue;
    }

    compiled.warnings.forEach((w) => warnings.push(w));
    results.push({ strokes: compiled.strokes, clear: compiled.clear });
  }

  return results;
}

describe('WhiteboardCanvas batch error resilience', () => {
  beforeEach(() => {
    mockCompile.mockReset();
  });

  it('continues processing subsequent batches when one throws', async () => {
    mockCompile
      .mockRejectedValueOnce(new Error('malformed data'))
      .mockResolvedValueOnce({ strokes: [], warnings: [], clear: false });

    const processedIds = new Set<string>();
    const warnings: string[] = [];
    const results = await processLoop(
      [makeBatch('bad'), makeBatch('good')],
      processedIds,
      warnings,
    );

    expect(results).toHaveLength(1);
    expect(processedIds.has('bad')).toBe(true);
    expect(processedIds.has('good')).toBe(true);
    expect(mockCompile).toHaveBeenCalledTimes(2);
  });

  it('records the failed batch_id in processedIds so it is not retried', async () => {
    mockCompile.mockRejectedValueOnce(new Error('crash'));

    const processedIds = new Set<string>();
    const warnings: string[] = [];
    await processLoop([makeBatch('fail-1')], processedIds, warnings);

    expect(processedIds.has('fail-1')).toBe(true);

    // Second pass should skip it
    mockCompile.mockResolvedValueOnce({ strokes: [], warnings: [], clear: false });
    await processLoop([makeBatch('fail-1')], processedIds, warnings);
    expect(mockCompile).toHaveBeenCalledTimes(1); // not called again
  });

  it('emits a warning string containing the batch_id', async () => {
    mockCompile.mockRejectedValueOnce(new Error('NaN coordinates'));

    const processedIds = new Set<string>();
    const warnings: string[] = [];
    await processLoop([makeBatch('batch-42')], processedIds, warnings);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('batch-42');
    expect(warnings[0]).toContain('NaN coordinates');
  });

  it('handles non-Error thrown values gracefully', async () => {
    mockCompile.mockRejectedValueOnce('string error');

    const processedIds = new Set<string>();
    const warnings: string[] = [];
    await processLoop([makeBatch('str-err')], processedIds, warnings);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('str-err');
    expect(warnings[0]).toContain('string error');
  });

  it('processes all batches when none throw', async () => {
    mockCompile.mockResolvedValue({ strokes: [], warnings: [], clear: false });

    const processedIds = new Set<string>();
    const warnings: string[] = [];
    const results = await processLoop(
      [makeBatch('a'), makeBatch('b'), makeBatch('c')],
      processedIds,
      warnings,
    );

    expect(results).toHaveLength(3);
    expect(warnings).toHaveLength(0);
  });
});
