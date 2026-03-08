import { describe, it, expect } from 'vitest';
import { demoPayloads } from './demo-payloads';
import { normalizeDrawBatchPayload } from '@/lib/schema';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner/constraints';

const MAX_STROKES_PER_PAYLOAD = 2000;
const MAX_COMPILE_TIME_MS = 100;

describe('Canvas render performance — full pipeline', () => {
  it('should have 10 demo payloads', () => {
    expect(demoPayloads).toHaveLength(10);
  });

  describe.each(demoPayloads.map((d) => [d.label, d] as const))(
    '%s',
    (_label, demo) => {
      it('compiles to strokes with reasonable count (<2000)', async () => {
        const { normalized } = normalizeDrawBatchPayload(demo.payload);
        const batch = normalized ?? demo.payload;
        const constrained = enforceDrawBatchConstraints(batch);
        const { strokes } = await compileBatchToStrokes(constrained.batch);

        expect(strokes.length).toBeLessThan(MAX_STROKES_PER_PAYLOAD);
        expect(strokes.length).toBeGreaterThan(0);
      });

      it('has no NaN coordinates in compiled strokes', async () => {
        const { normalized } = normalizeDrawBatchPayload(demo.payload);
        const batch = normalized ?? demo.payload;
        const constrained = enforceDrawBatchConstraints(batch);
        const { strokes } = await compileBatchToStrokes(constrained.batch);

        for (const stroke of strokes) {
          for (let i = 0; i < stroke.points.length; i++) {
            const p = stroke.points[i]!;
            expect(
              Number.isFinite(p.x),
              `Stroke ${stroke.id} point ${i} has non-finite x: ${p.x}`,
            ).toBe(true);
            expect(
              Number.isFinite(p.y),
              `Stroke ${stroke.id} point ${i} has non-finite y: ${p.y}`,
            ).toBe(true);
          }
        }
      });

      it(`compiles in <${MAX_COMPILE_TIME_MS}ms`, async () => {
        const { normalized } = normalizeDrawBatchPayload(demo.payload);
        const batch = normalized ?? demo.payload;
        const constrained = enforceDrawBatchConstraints(batch);

        const start = performance.now();
        await compileBatchToStrokes(constrained.batch);
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(MAX_COMPILE_TIME_MS);
      });
    },
  );
});
