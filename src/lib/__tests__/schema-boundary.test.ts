import { describe, expect, it } from 'vitest';
import { AgentStreamRequestSchema, SemanticBatchSchema } from '../schema';

// Minimal valid objects for building test payloads
function makeAgentStreamBase(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 's1',
    userMessage: 'hello',
    history: [],
    ...overrides,
  };
}

function makeStructuredContext(overrides: Record<string, unknown> = {}) {
  return {
    scene_summary: { element_count: 0, type_counts: {} },
    occupied_regions: [],
    anchors: [],
    recent_blocks: [],
    suggested_next_regions: [],
    token_budget_hint: { max_chars: 1000 },
    ...overrides,
  };
}

function makeRegion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    semantic_kind: 'diagram',
    priority: 5,
    ...overrides,
  };
}

function makeSuggestedRegion(index: number) {
  return { name: `region-${index}`, x: index * 10, y: 0, w: 50, h: 50, score: 0.5 };
}

function makeChatMessage(index: number) {
  return { id: `msg-${index}`, role: 'user' as const, content: `message ${index}` };
}

describe('Zod schema boundary values', () => {
  describe('priority at exact boundaries [0, 10]', () => {
    it('accepts priority = 0', () => {
      const input = makeAgentStreamBase({
        whiteboardContextV2: makeStructuredContext({
          occupied_regions: [makeRegion({ priority: 0 })],
        }),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).not.toThrow();
    });

    it('accepts priority = 10', () => {
      const input = makeAgentStreamBase({
        whiteboardContextV2: makeStructuredContext({
          occupied_regions: [makeRegion({ priority: 10 })],
        }),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).not.toThrow();
    });

    it('rejects priority = -1', () => {
      const input = makeAgentStreamBase({
        whiteboardContextV2: makeStructuredContext({
          occupied_regions: [makeRegion({ priority: -1 })],
        }),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).toThrow();
    });

    it('rejects priority = 11', () => {
      const input = makeAgentStreamBase({
        whiteboardContextV2: makeStructuredContext({
          occupied_regions: [makeRegion({ priority: 11 })],
        }),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).toThrow();
    });
  });

  describe('suggested_next_regions array at max(8)', () => {
    it('accepts array of 8 regions', () => {
      const input = makeAgentStreamBase({
        whiteboardContextV2: makeStructuredContext({
          suggested_next_regions: Array.from({ length: 8 }, (_, i) => makeSuggestedRegion(i)),
        }),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).not.toThrow();
    });

    it('rejects array of 9 regions', () => {
      const input = makeAgentStreamBase({
        whiteboardContextV2: makeStructuredContext({
          suggested_next_regions: Array.from({ length: 9 }, (_, i) => makeSuggestedRegion(i)),
        }),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).toThrow();
    });
  });

  describe('max_chars at boundaries [1, 20000]', () => {
    it('accepts max_chars = 1', () => {
      const input = makeAgentStreamBase({
        whiteboardContextV2: makeStructuredContext({
          token_budget_hint: { max_chars: 1 },
        }),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).not.toThrow();
    });

    it('accepts max_chars = 20000', () => {
      const input = makeAgentStreamBase({
        whiteboardContextV2: makeStructuredContext({
          token_budget_hint: { max_chars: 20000 },
        }),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).not.toThrow();
    });

    it('rejects max_chars = 0', () => {
      const input = makeAgentStreamBase({
        whiteboardContextV2: makeStructuredContext({
          token_budget_hint: { max_chars: 0 },
        }),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).toThrow();
    });

    it('rejects max_chars = 20001', () => {
      const input = makeAgentStreamBase({
        whiteboardContextV2: makeStructuredContext({
          token_budget_hint: { max_chars: 20001 },
        }),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).toThrow();
    });
  });

  describe('history at max(100)', () => {
    it('accepts 100 messages', () => {
      const input = makeAgentStreamBase({
        history: Array.from({ length: 100 }, (_, i) => makeChatMessage(i)),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).not.toThrow();
    });

    it('rejects 101 messages', () => {
      const input = makeAgentStreamBase({
        history: Array.from({ length: 101 }, (_, i) => makeChatMessage(i)),
      });
      expect(() => AgentStreamRequestSchema.parse(input)).toThrow();
    });
  });

  describe('RelativePose x/y at [0, 1]', () => {
    function makeSemanticBatch(relativePose: Record<string, unknown>) {
      return {
        batch_id: 'b1',
        template: 'freeform_semantic',
        blocks: [
          {
            id: 'dp1',
            kind: 'diagram_panel',
            shapes: [
              { id: 's1', type: 'rect', relative_pose: relativePose },
            ],
          },
        ],
      };
    }

    it('accepts x=0, y=0', () => {
      expect(() => SemanticBatchSchema.parse(makeSemanticBatch({ x: 0, y: 0 }))).not.toThrow();
    });

    it('accepts x=1, y=1', () => {
      expect(() => SemanticBatchSchema.parse(makeSemanticBatch({ x: 1, y: 1 }))).not.toThrow();
    });

    it('rejects x=-0.001', () => {
      expect(() => SemanticBatchSchema.parse(makeSemanticBatch({ x: -0.001, y: 0.5 }))).toThrow();
    });

    it('rejects x=1.001', () => {
      expect(() => SemanticBatchSchema.parse(makeSemanticBatch({ x: 1.001, y: 0.5 }))).toThrow();
    });
  });
});
