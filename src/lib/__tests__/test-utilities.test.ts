import { describe, it, expect } from 'vitest';
import {
  buildDrawElement,
  buildDrawBatch,
  buildChatMessage,
  buildPoints,
} from '@/test/factories';
import {
  expectPointsFinite,
  expectValidDrawBatch,
} from '@/test/assertions';
import {
  DrawBatchBuilder,
  SemanticBatchBuilder,
} from '@/test/builders';

describe('Test Utilities', () => {
  describe('factories', () => {
    it('buildDrawElement() returns a valid element with defaults', () => {
      const el = buildDrawElement();
      expect(el.type).toBe('rect');
      expect(el.id).toBeDefined();
      expect((el as any).x).toBeDefined();
      expect((el as any).y).toBeDefined();
    });

    it('buildDrawElement({ type: "ellipse" }) overrides type correctly', () => {
      const el = buildDrawElement({ type: 'ellipse' as any } as any);
      // With overrides spread, the type should be overridden
      expect(el.type).toBe('ellipse');
    });

    it('buildDrawBatch() returns a batch with non-empty elements', () => {
      const batch = buildDrawBatch();
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('buildChatMessage() returns message with id, role, content', () => {
      const msg = buildChatMessage();
      expect(msg.id).toBeDefined();
      expect(msg.role).toBeDefined();
      expect(msg.content).toBeDefined();
    });

    it('buildPoints(10) returns exactly 10 finite-coordinate points', () => {
      const points = buildPoints(10);
      expect(points).toHaveLength(10);
      for (const p of points) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    });
  });

  describe('assertions', () => {
    it('expectPointsFinite throws on NaN coordinates', () => {
      expect(() => expectPointsFinite([{ x: NaN, y: 0 }])).toThrow();
    });

    it('expectValidDrawBatch passes for a well-formed batch', () => {
      const batch = buildDrawBatch();
      expect(() => expectValidDrawBatch(batch)).not.toThrow();
    });

    it('expectValidDrawBatch fails for a batch with no elements', () => {
      expect(() =>
        expectValidDrawBatch({ batch_id: 'b1', elements: [] }),
      ).toThrow();
    });
  });

  describe('builders', () => {
    it('DrawBatchBuilder fluent API produces valid batch', () => {
      const batch = new DrawBatchBuilder().withId('x').build();
      expect(batch.batch_id).toBe('x');
      expect(batch.elements.length).toBeGreaterThan(0);
      expect(() => expectValidDrawBatch(batch)).not.toThrow();
    });

    it('SemanticBatchBuilder produces batch with equation stack', () => {
      const batch = new SemanticBatchBuilder()
        .withEquationStack(['a=1', 'b=2'])
        .build();
      expect(batch.blocks.length).toBeGreaterThan(0);
      const eqBlock = batch.blocks.find((b) => b.kind === 'equation_stack');
      expect(eqBlock).toBeDefined();
      expect((eqBlock as any).lines).toHaveLength(2);
    });
  });
});
