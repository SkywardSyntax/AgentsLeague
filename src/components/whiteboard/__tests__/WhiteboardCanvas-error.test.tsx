import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DrawBatch, StrokeTrajectory } from '@/types/agent';

type CompileResult = { strokes: StrokeTrajectory[]; warnings: string[]; clear: boolean };

const mockCompile = vi.fn<(batch: DrawBatch) => Promise<CompileResult>>();
const mockNormalize = vi.fn();

vi.mock('@/lib/whiteboard/semantic-to-strokes', () => ({
  compileBatchToStrokes: (...args: [DrawBatch]) => mockCompile(...args),
}));

vi.mock('@/lib/whiteboard/layout-spacing', () => ({
  normalizeBatchTextSpacingAgainstScene: (...args: unknown[]) => mockNormalize(...args),
}));

function makeBatch(id: string): DrawBatch {
  return { batch_id: id, elements: [] };
}

function makeStroke(): StrokeTrajectory {
  return {
    id: 's1',
    elementId: 'e1',
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    color: '#000',
    baseWidth: 1,
  };
}

/**
 * Simulates the WhiteboardCanvas process() loop including the outer .catch()
 * handler added in iteration 15. Errors that escape the inner try/catch
 * (e.g. from normalizeBatchTextSpacingAgainstScene) are caught by the outer
 * handler and surfaced via onWarning with "Batch compilation failed".
 */
async function processWithCatch(
  batches: DrawBatch[],
  processedIds: Set<string>,
  onWarning: (msg: string) => void,
) {
  let cancelled = false;

  const process = async () => {
    for (const batch of batches) {
      if (processedIds.has(batch.batch_id)) continue;
      processedIds.add(batch.batch_id);

      let compiled;
      try {
        compiled = await mockCompile(batch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onWarning(`Failed to compile batch ${batch.batch_id}: ${msg}`);
        continue;
      }
      if (cancelled) return;

      compiled.warnings.forEach((w) => onWarning(w));

      if (compiled.strokes.length > 0) {
        mockNormalize(batch, compiled.strokes, []);
      }
    }
  };

  await process().catch((err: unknown) => {
    if (!cancelled) {
      onWarning(`Batch compilation failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  });
}

describe('WhiteboardCanvas process() outer catch handler', () => {
  beforeEach(() => {
    mockCompile.mockReset();
    mockNormalize.mockReset();
  });

  it('calls onWarning with "Batch compilation failed" when an unhandled error escapes process()', async () => {
    mockCompile.mockResolvedValueOnce({
      strokes: [makeStroke()],
      warnings: [],
      clear: false,
    });
    mockNormalize.mockImplementation(() => {
      throw new Error('spacing explosion');
    });

    const onWarning = vi.fn();
    const processedIds = new Set<string>();

    await processWithCatch([makeBatch('b1')], processedIds, onWarning);

    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('Batch compilation failed'),
    );
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('spacing explosion'),
    );
  });
});
