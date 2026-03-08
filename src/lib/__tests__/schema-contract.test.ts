import { describe, it, expect } from 'vitest';
import {
  DrawBatchSchema,
  DrawElementSchema,
  SemanticBatchSchema,
  AgentStreamRequestSchema,
} from '../schema';

describe('Schema contract stability', () => {
  describe('DrawBatchSchema — accepts valid, rejects invalid', () => {
    it('accepts a valid draw batch with a rect element', () => {
      const valid = {
        batch_id: 'b1',
        elements: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
      };
      expect(DrawBatchSchema.parse(valid)).toMatchObject(valid);
    });

    it('accepts a draw batch with empty elements', () => {
      const valid = { batch_id: 'b1', elements: [] };
      expect(DrawBatchSchema.parse(valid)).toMatchObject(valid);
    });

    it('rejects when batch_id is empty string', () => {
      const invalid = { batch_id: '', elements: [] };
      expect(DrawBatchSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects when elements field is missing', () => {
      const invalid = { batch_id: 'b1' };
      expect(DrawBatchSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects when batch_id is missing', () => {
      const invalid = { elements: [] };
      expect(DrawBatchSchema.safeParse(invalid).success).toBe(false);
    });

    it('has the expected top-level field set', () => {
      const keys = Object.keys(DrawBatchSchema.shape).sort();
      expect(keys).toEqual(['batch_id', 'elements', 'schemaVersion', 'source', 'style_preset']);
    });
  });

  describe('SemanticBatchSchema — field set stability', () => {
    const validSemanticBatch = {
      batch_id: 'sb1',
      template: 'equation_derivation_vertical',
      blocks: [
        {
          id: 'eq1',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'x^2' }],
        },
      ],
    };

    it('accepts a valid semantic batch with equation_stack block', () => {
      expect(SemanticBatchSchema.parse(validSemanticBatch)).toMatchObject(validSemanticBatch);
    });

    it('rejects when blocks is empty', () => {
      const invalid = { ...validSemanticBatch, blocks: [] };
      expect(SemanticBatchSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects an invalid template value', () => {
      const invalid = { ...validSemanticBatch, template: 'nonexistent_template' };
      expect(SemanticBatchSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects an invalid intent value', () => {
      const invalid = { ...validSemanticBatch, intent: 'invalid_intent' };
      expect(SemanticBatchSchema.safeParse(invalid).success).toBe(false);
    });

    it('accepts all valid template values', () => {
      for (const tpl of [
        'equation_derivation_vertical',
        'jacobian_mapping_2panel',
        'freeform_semantic',
      ]) {
        const input = { ...validSemanticBatch, template: tpl };
        expect(SemanticBatchSchema.safeParse(input).success).toBe(true);
      }
    });

    it('accepts all valid intent values', () => {
      for (const intent of ['teach', 'derive', 'compare', 'summarize']) {
        const input = { ...validSemanticBatch, intent };
        expect(SemanticBatchSchema.safeParse(input).success).toBe(true);
      }
    });

    it('has the expected top-level field set', () => {
      const keys = Object.keys(SemanticBatchSchema.shape).sort();
      expect(keys).toEqual(['batch_id', 'blocks', 'intent', 'relations', 'style_preset', 'template']);
    });
  });

  describe('AgentStreamRequestSchema — field set stability', () => {
    const validRequest = {
      sessionId: 's1',
      userMessage: 'hello',
      history: [],
    };

    it('accepts a valid request', () => {
      expect(AgentStreamRequestSchema.parse(validRequest)).toMatchObject(validRequest);
    });

    it('rejects when sessionId is empty', () => {
      const invalid = { ...validRequest, sessionId: '' };
      expect(AgentStreamRequestSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects when history exceeds 100 entries', () => {
      const bigHistory = Array.from({ length: 101 }, (_, i) => ({
        id: `m${i}`,
        role: 'user' as const,
        content: `msg ${i}`,
      }));
      const invalid = { ...validRequest, history: bigHistory };
      expect(AgentStreamRequestSchema.safeParse(invalid).success).toBe(false);
    });

    it('accepts exactly 100 history entries', () => {
      const maxHistory = Array.from({ length: 100 }, (_, i) => ({
        id: `m${i}`,
        role: 'user' as const,
        content: `msg ${i}`,
      }));
      const input = { ...validRequest, history: maxHistory };
      expect(AgentStreamRequestSchema.safeParse(input).success).toBe(true);
    });

    it('has the expected top-level field set', () => {
      const keys = Object.keys(AgentStreamRequestSchema.shape).sort();
      expect(keys).toEqual([
        'history',
        'plannerMode',
        'scenario',
        'sessionId',
        'userMessage',
        'whiteboardContext',
        'whiteboardContextV2',
      ]);
    });
  });

  describe('DrawElementSchema — discriminated union coverage', () => {
    const minimalElements: Record<string, Record<string, unknown>> = {
      rect: { id: 'e1', type: 'rect', x: 0, y: 0, w: 5, h: 5 },
      ellipse: { id: 'e2', type: 'ellipse', cx: 0, cy: 0, rx: 5, ry: 5 },
      line: { id: 'e3', type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
      arrow: { id: 'e4', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
      text: { id: 'e5', type: 'text', x: 0, y: 0, text: 'hi' },
      latex: { id: 'e6', type: 'latex', x: 0, y: 0, tex: 'x^2' },
      clear: { id: 'e7', type: 'clear' },
    };

    for (const [typeName, element] of Object.entries(minimalElements)) {
      it(`parses valid ${typeName} element`, () => {
        const result = DrawElementSchema.safeParse(element);
        expect(result.success).toBe(true);
      });
    }

    it('rejects rect missing w/h', () => {
      const invalid = { id: 'e1', type: 'rect', x: 0, y: 0 };
      expect(DrawElementSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects ellipse missing rx/ry', () => {
      const invalid = { id: 'e2', type: 'ellipse', cx: 0, cy: 0 };
      expect(DrawElementSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects line missing from/to', () => {
      const invalid = { id: 'e3', type: 'line', from: { x: 0, y: 0 } };
      expect(DrawElementSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects arrow missing from/to', () => {
      const invalid = { id: 'e4', type: 'arrow', to: { x: 10, y: 10 } };
      expect(DrawElementSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects text missing text field', () => {
      const invalid = { id: 'e5', type: 'text', x: 0, y: 0 };
      expect(DrawElementSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects latex missing tex field', () => {
      const invalid = { id: 'e6', type: 'latex', x: 0, y: 0 };
      expect(DrawElementSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects unknown element type', () => {
      const invalid = { id: 'e8', type: 'polygon', points: [] };
      expect(DrawElementSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects element with empty id', () => {
      const invalid = { id: '', type: 'clear' };
      expect(DrawElementSchema.safeParse(invalid).success).toBe(false);
    });
  });
});
