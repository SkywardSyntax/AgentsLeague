import { describe, it, expect, beforeEach } from 'vitest';
import { parseSSEBuffer } from '@/hooks/sse-parser';
import type {
  AgentSSEEvent,
  ChatMessage,
  DrawBatch,
  DrawElement,
  SemanticBatch,
  WhiteboardLayoutDiagnostics,
} from '@/types/agent';

/**
 * Minimal ChatSessionState matching the shape used by AppShell's handleEvent.
 * We replay SSE events through equivalent reducer logic extracted from AppShell
 * to verify the full SSE → state pipeline end-to-end.
 */
interface ChatSessionState {
  id: string;
  messages: ChatMessage[];
  scene: DrawElement[];
  semanticScene: SemanticBatch[];
  plannerMeta: WhiteboardLayoutDiagnostics[];
  batches: DrawBatch[];
  warnings: string[];
}

interface TurnState {
  status: 'idle' | 'thinking' | 'streaming' | 'drawing';
  currentAssistantMessageId: string | null;
  turnHadRenderableOutput: boolean;
  turnSawToolBatch: boolean;
  pendingDiagnostics: Map<
    string,
    {
      batchId: string;
      templateUsed: WhiteboardLayoutDiagnostics['templateUsed'];
      fallbackUsed: boolean;
      violationsFixed: string[];
      semanticBatch?: SemanticBatch;
    }
  >;
}

let nextId = 0;
function createId(): string {
  return `test-id-${++nextId}`;
}

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return { id: createId(), role, content, createdAt: Date.now() };
}

function createEmptyChat(): ChatSessionState {
  return {
    id: 'chat-1',
    messages: [],
    scene: [],
    semanticScene: [],
    plannerMeta: [],
    batches: [],
    warnings: [],
  };
}

function createTurnState(): TurnState {
  return {
    status: 'idle',
    currentAssistantMessageId: null,
    turnHadRenderableOutput: false,
    turnSawToolBatch: false,
    pendingDiagnostics: new Map(),
  };
}

/**
 * Replay an AgentSSEEvent through the same logic AppShell.handleEvent uses,
 * mutating chat and turn state in place. This mirrors the actual production
 * code paths without importing React components.
 */
function applyEvent(
  chat: ChatSessionState,
  turn: TurnState,
  event: AgentSSEEvent,
): void {
  if (event.type === 'assistant.text.delta') {
    turn.turnHadRenderableOutput = true;
    turn.status = 'streaming';

    const currentId = turn.currentAssistantMessageId;
    if (!currentId) {
      const msg = createMessage('assistant', event.delta);
      turn.currentAssistantMessageId = msg.id;
      chat.messages.push(msg);
      return;
    }

    const existing = chat.messages.find((m) => m.id === currentId);
    if (!existing) {
      const msg = createMessage('assistant', event.delta);
      turn.currentAssistantMessageId = msg.id;
      chat.messages.push(msg);
      return;
    }

    existing.content += event.delta;
    return;
  }

  if (event.type === 'assistant.text.done') {
    turn.currentAssistantMessageId = null;
    return;
  }

  if (event.type === 'whiteboard.batch') {
    turn.turnHadRenderableOutput = true;
    const isProvisional = event.batch.batch_id.startsWith('stream-provisional-');
    if (!isProvisional) turn.turnSawToolBatch = true;

    const diagnostics = turn.pendingDiagnostics.get(event.batch.batch_id);
    if (diagnostics) turn.pendingDiagnostics.delete(event.batch.batch_id);

    turn.status = 'drawing';
    const hasClear = event.batch.elements.some((el) => el.type === 'clear');
    if (hasClear) chat.scene = [];
    for (const el of event.batch.elements) {
      if (el.type !== 'clear') chat.scene.push(el);
    }

    if (diagnostics) {
      chat.plannerMeta.push({
        batchId: diagnostics.batchId,
        templateUsed: diagnostics.templateUsed,
        fallbackUsed: diagnostics.fallbackUsed,
        violationsFixed: diagnostics.violationsFixed,
      });
    }

    const semanticBatch: SemanticBatch = diagnostics?.semanticBatch ?? {
      batch_id: event.batch.batch_id,
      template: 'freeform_semantic',
      intent: 'summarize',
      blocks: [
        {
          id: `legacy-${event.batch.batch_id}`,
          kind: 'caption',
          text: `Imported legacy draw batch (${event.batch.elements.length} elements)`,
          region_hint: 'bottom',
        },
      ],
    };
    chat.semanticScene.push(semanticBatch);
    chat.batches.push(event.batch);
    return;
  }

  if (event.type === 'whiteboard.layout.diagnostics') {
    turn.pendingDiagnostics.set(event.batchId, {
      batchId: event.batchId,
      templateUsed: event.templateUsed,
      fallbackUsed: event.fallbackUsed,
      violationsFixed: event.violationsFixed,
      semanticBatch: event.semanticBatch,
    });
    return;
  }

  if (event.type === 'warning') {
    chat.warnings.push(event.message + (event.context ? ` (${event.context})` : ''));
    return;
  }

  if (event.type === 'error') {
    turn.currentAssistantMessageId = null;
    turn.status = 'idle';
    turn.turnSawToolBatch = false;
    turn.pendingDiagnostics.clear();
    chat.messages.push(createMessage('assistant', `Error: ${event.message}`));
    return;
  }

  if (event.type === 'turn.done') {
    if (!turn.turnHadRenderableOutput) {
      chat.messages.push(
        createMessage('assistant', 'I could not produce output for that turn. Please try again.'),
      );
    }
    turn.turnHadRenderableOutput = false;
    turn.currentAssistantMessageId = null;
    turn.turnSawToolBatch = false;
    turn.pendingDiagnostics.clear();
    turn.status = 'idle';
  }
}

describe('SSE → Reducer full-cycle integration', () => {
  beforeEach(() => {
    nextId = 0;
  });

  it('realistic turn sequence produces correct final state', () => {
    const raw =
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"Hello"}\n\n' +
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":" world"}\n\n' +
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"!"}\n\n' +
      'data: {"type":"assistant.text.done","turnId":"t1","messageId":"m1"}\n\n' +
      'data: {"type":"whiteboard.layout.diagnostics","turnId":"t1","batchId":"b1","violationsFixed":["overlap"],"templateUsed":"freeform_semantic","fallbackUsed":false}\n\n' +
      'data: {"type":"whiteboard.batch","turnId":"t1","batch":{"batch_id":"b1","elements":[{"id":"r1","type":"rect","x":0,"y":0,"w":100,"h":50}]}}\n\n' +
      'data: {"type":"turn.done","turnId":"t1","usage":{"prompt":10,"completion":5,"total":15}}\n\n';

    const { events, errors } = parseSSEBuffer(raw);
    expect(errors).toHaveLength(0);
    expect(events).toHaveLength(7);

    const chat = createEmptyChat();
    const turn = createTurnState();

    for (const event of events) {
      applyEvent(chat, turn, event as AgentSSEEvent);
    }

    // Final assertions
    expect(turn.status).toBe('idle');

    // 1 assistant message with concatenated content
    const assistantMsgs = chat.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0].content).toBe('Hello world!');

    // 1 batch in batches array
    expect(chat.batches).toHaveLength(1);
    expect(chat.batches[0].batch_id).toBe('b1');

    // Scene has the rect element
    expect(chat.scene).toHaveLength(1);
    expect(chat.scene[0].type).toBe('rect');

    // Planner meta has 1 entry from diagnostics
    expect(chat.plannerMeta).toHaveLength(1);
    expect(chat.plannerMeta[0].batchId).toBe('b1');
    expect(chat.plannerMeta[0].violationsFixed).toEqual(['overlap']);

    // Semantic scene has 1 entry
    expect(chat.semanticScene).toHaveLength(1);

    // Turn state is fully reset
    expect(turn.currentAssistantMessageId).toBeNull();
    expect(turn.turnHadRenderableOutput).toBe(false);
    expect(turn.turnSawToolBatch).toBe(false);
    expect(turn.pendingDiagnostics.size).toBe(0);
  });

  it('malformed SSE chunk mid-sequence still yields correct state for valid events', () => {
    const raw =
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"OK"}\n\n' +
      'data: {BROKEN JSON HERE}\n\n' +
      'data: {"type":"assistant.text.done","turnId":"t1","messageId":"m1"}\n\n' +
      'data: {"type":"turn.done","turnId":"t1"}\n\n';

    const { events, errors } = parseSSEBuffer(raw);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Invalid SSE JSON');
    expect(events).toHaveLength(3);

    const chat = createEmptyChat();
    const turn = createTurnState();

    for (const event of events) {
      applyEvent(chat, turn, event as AgentSSEEvent);
    }

    // Turn ends cleanly
    expect(turn.status).toBe('idle');

    // Valid text delta produced an assistant message
    const assistantMsgs = chat.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0].content).toBe('OK');
  });

  it('whiteboard.batch before text.delta (tool-only turn) — no fallback message', () => {
    const raw =
      'data: {"type":"whiteboard.batch","turnId":"t1","batch":{"batch_id":"tool-b1","elements":[{"id":"e1","type":"ellipse","cx":50,"cy":50,"rx":30,"ry":20}]}}\n\n' +
      'data: {"type":"turn.done","turnId":"t1"}\n\n';

    const { events, errors } = parseSSEBuffer(raw);
    expect(errors).toHaveLength(0);
    expect(events).toHaveLength(2);

    const chat = createEmptyChat();
    const turn = createTurnState();

    for (const event of events) {
      applyEvent(chat, turn, event as AgentSSEEvent);
    }

    // turnHadRenderableOutput was set true by the batch, so no fallback message
    const assistantMsgs = chat.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(0);

    // Scene has the ellipse
    expect(chat.scene).toHaveLength(1);
    expect(chat.scene[0].type).toBe('ellipse');

    // Turn ends idle
    expect(turn.status).toBe('idle');
  });

  it('error event mid-turn resets state and appends error message', () => {
    const raw =
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"partial"}\n\n' +
      'data: {"type":"error","turnId":"t1","code":"RATE_LIMIT","message":"Rate limited","retryable":true}\n\n';

    const { events, errors } = parseSSEBuffer(raw);
    expect(errors).toHaveLength(0);
    expect(events).toHaveLength(2);

    const chat = createEmptyChat();
    const turn = createTurnState();

    for (const event of events) {
      applyEvent(chat, turn, event as AgentSSEEvent);
    }

    expect(turn.status).toBe('idle');
    const assistantMsgs = chat.messages.filter((m) => m.role === 'assistant');
    // 2 messages: the partial text delta and the error message
    expect(assistantMsgs).toHaveLength(2);
    expect(assistantMsgs[0].content).toBe('partial');
    expect(assistantMsgs[1].content).toContain('Error: Rate limited');
  });

  it('warning events are collected into chat warnings', () => {
    const raw =
      'data: {"type":"warning","turnId":"t1","code":"WARN_001","message":"Low quality","context":"batch-x"}\n\n' +
      'data: {"type":"turn.done","turnId":"t1"}\n\n';

    const { events, errors } = parseSSEBuffer(raw);
    expect(errors).toHaveLength(0);

    const chat = createEmptyChat();
    const turn = createTurnState();

    for (const event of events) {
      applyEvent(chat, turn, event as AgentSSEEvent);
    }

    expect(chat.warnings).toHaveLength(1);
    expect(chat.warnings[0]).toBe('Low quality (batch-x)');
    expect(turn.status).toBe('idle');
  });

  it('diagnostics arriving before batch are correctly associated', () => {
    const raw =
      'data: {"type":"whiteboard.layout.diagnostics","turnId":"t1","batchId":"diag-b1","violationsFixed":["gap"],"templateUsed":"equation_derivation_vertical","fallbackUsed":true}\n\n' +
      'data: {"type":"whiteboard.batch","turnId":"t1","batch":{"batch_id":"diag-b1","elements":[{"id":"t1","type":"text","x":10,"y":10,"text":"hello","size":14}]}}\n\n' +
      'data: {"type":"turn.done","turnId":"t1"}\n\n';

    const { events, errors } = parseSSEBuffer(raw);
    expect(errors).toHaveLength(0);

    const chat = createEmptyChat();
    const turn = createTurnState();

    for (const event of events) {
      applyEvent(chat, turn, event as AgentSSEEvent);
    }

    expect(chat.plannerMeta).toHaveLength(1);
    expect(chat.plannerMeta[0].templateUsed).toBe('equation_derivation_vertical');
    expect(chat.plannerMeta[0].fallbackUsed).toBe(true);
    expect(chat.plannerMeta[0].violationsFixed).toEqual(['gap']);

    // Pending diagnostics map is cleared after turn
    expect(turn.pendingDiagnostics.size).toBe(0);
  });
});
