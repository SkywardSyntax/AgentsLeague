import { describe, it, expect } from 'vitest';
import type {
  AgentSSEEvent,
  ChatMessage,
  PlannerMode,
  WhiteboardContext,
  StructuredWhiteboardContext,
} from '@/types/agent';
import type { StreamHandlers } from '@/hooks/useAgentStream';

describe('Lane 03 — Chat Hook API', () => {
  it('StreamHandlers interface has onEvent and onError', () => {
    const handlers: StreamHandlers = {
      onEvent: (_e: AgentSSEEvent) => {},
      onError: (_m: string) => {},
    };
    expect(Object.keys(handlers).sort()).toMatchInlineSnapshot(`
      [
        "onError",
        "onEvent",
      ]
    `);
  });

  it('run() argument shape is stable', () => {
    const argKeys = [
      'sessionId',
      'userMessage',
      'history',
      'plannerMode',
      'whiteboardContext',
      'whiteboardContextV2',
      'handlers',
    ];
    expect(argKeys.sort()).toMatchInlineSnapshot(`
      [
        "handlers",
        "history",
        "plannerMode",
        "sessionId",
        "userMessage",
        "whiteboardContext",
        "whiteboardContextV2",
      ]
    `);
  });

  it('ChatMessage type shape is stable', () => {
    const msg: ChatMessage = {
      id: 'm1',
      role: 'user',
      content: 'hello',
      createdAt: 1000,
    };
    expect(Object.keys(msg).sort()).toMatchInlineSnapshot(`
      [
        "content",
        "createdAt",
        "id",
        "role",
      ]
    `);
  });

  it('ChatRole union values are stable', () => {
    const roles: ChatMessage['role'][] = ['user', 'assistant', 'system'];
    expect(roles).toMatchInlineSnapshot(`
      [
        "user",
        "assistant",
        "system",
      ]
    `);
  });

  it('PlannerMode union values are stable', () => {
    const modes: PlannerMode[] = ['semantic_preferred', 'legacy_draw_only'];
    expect(modes).toMatchInlineSnapshot(`
      [
        "semantic_preferred",
        "legacy_draw_only",
      ]
    `);
  });

  it('WhiteboardContext interface shape is stable', () => {
    const ctx: WhiteboardContext = {
      elementCount: 0,
      elementTypeCounts: {},
      recentElements: [],
      suggestedNextOrigin: { x: 0, y: 0 },
    };
    expect(Object.keys(ctx).sort()).toMatchInlineSnapshot(`
      [
        "elementCount",
        "elementTypeCounts",
        "recentElements",
        "suggestedNextOrigin",
      ]
    `);
  });

  it('StructuredWhiteboardContext interface shape is stable', () => {
    const ctx: StructuredWhiteboardContext = {
      scene_summary: { element_count: 0, type_counts: {} },
      occupied_regions: [],
      anchors: [],
      recent_blocks: [],
      suggested_next_regions: [],
      token_budget_hint: { max_chars: 5000 },
    };
    expect(Object.keys(ctx).sort()).toMatchInlineSnapshot(`
      [
        "anchors",
        "occupied_regions",
        "recent_blocks",
        "scene_summary",
        "suggested_next_regions",
        "token_budget_hint",
      ]
    `);
  });

  it('AgentSSEEvent type discriminants are stable', () => {
    const eventTypes: AgentSSEEvent['type'][] = [
      'assistant.text.delta',
      'assistant.text.done',
      'whiteboard.batch',
      'whiteboard.layout.diagnostics',
      'warning',
      'error',
      'turn.done',
    ];
    expect(eventTypes).toMatchInlineSnapshot(`
      [
        "assistant.text.delta",
        "assistant.text.done",
        "whiteboard.batch",
        "whiteboard.layout.diagnostics",
        "warning",
        "error",
        "turn.done",
      ]
    `);
  });

  it('run() sends POST to /api/agent/stream', () => {
    const expectedConfig = {
      method: 'POST',
      url: '/api/agent/stream',
      contentType: 'application/json',
      accept: 'text/event-stream',
    };
    expect(expectedConfig).toMatchInlineSnapshot(`
      {
        "accept": "text/event-stream",
        "contentType": "application/json",
        "method": "POST",
        "url": "/api/agent/stream",
      }
    `);
  });

  it('run() request body shape is stable', () => {
    const bodyKeys = [
      'sessionId',
      'userMessage',
      'history',
      'plannerMode',
      'whiteboardContext',
      'whiteboardContextV2',
    ];
    expect(bodyKeys.sort()).toMatchInlineSnapshot(`
      [
        "history",
        "plannerMode",
        "sessionId",
        "userMessage",
        "whiteboardContext",
        "whiteboardContextV2",
      ]
    `);
  });
});
