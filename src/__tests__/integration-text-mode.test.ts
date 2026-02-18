/**
 * Integration tests: Text mode full user flow.
 *
 * Flow: user types → AI responds (SSE stream) → drawing appears → reasoning shown
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useConversationStore } from '@/stores/conversation-store';
import { useDrawingSessionStore } from '@/stores/drawing-session';
import { InteractionMode, MessageRole } from '@/types/interaction';
import { transition } from '@/types/state';
import type { WhiteboardState } from '@/types/state';
import type { UnitFloat } from '@/types/primitives';
import type { DrawOp, RectElement } from '@/types/drawing';
import {
  createMockDrawOpStream,
  createMockFetch,
  createMockWhiteboardStore,
} from '@/lib/test-utils/helpers';
import {
  createMockOpenAIClient,
  createSSEBody,
  createDrawToolFixture,
} from '@/lib/test-utils/mocks';
import { rectElement } from '@/lib/test-utils/fixtures';

// ── Helpers ─────────────────────────────────────────────────────

function resetStores() {
  useConversationStore.setState({
    messages: [],
    mode: InteractionMode.TEXT,
    isProcessing: false,
  });
  useDrawingSessionStore.getState().reset();
}

function makeRect(id: string, overrides: Partial<RectElement> = {}): RectElement {
  return {
    ...rectElement,
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('Integration: Text Mode Full Flow', () => {
  beforeEach(() => {
    resetStores();
  });

  // ── User message → assistant response ───────────────────────

  it('adds user message to conversation store on submit', () => {
    const store = useConversationStore.getState();
    store.addMessage('Draw a blue rectangle', MessageRole.USER, {
      source: InteractionMode.TEXT,
    });

    const messages = useConversationStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe(MessageRole.USER);
    expect(messages[0]!.content).toBe('Draw a blue rectangle');
    expect(messages[0]!.source).toBe(InteractionMode.TEXT);
  });

  it('transitions through processing states correctly', () => {
    let state: WhiteboardState = { status: 'idle' };

    // User submits prompt
    state = transition(state, {
      type: 'SUBMIT_PROMPT',
      prompt: 'Draw a blue rectangle',
    });
    expect(state.status).toBe('processing');
    if (state.status === 'processing') {
      expect(state.prompt).toBe('Draw a blue rectangle');
      expect(state.requestId).toBeTruthy();
    }

    // AI responds with shapes
    state = transition(state, {
      type: 'AI_RESPONSE',
      shapes: [],
    });
    expect(state.status).toBe('drawing');

    // Drawing progresses
    state = transition(state, {
      type: 'DRAWING_PROGRESS',
      progress: 0.5 as UnitFloat,
    });
    expect(state.status).toBe('drawing');

    // Drawing completes
    state = transition(state, { type: 'DRAWING_COMPLETE' });
    expect(state.status).toBe('complete');

    // Resets to idle
    state = transition(state, { type: 'RESET' });
    expect(state.status).toBe('idle');
  });

  // ── SSE streaming with drawing ops ──────────────────────────

  it('processes SSE stream of draw operations', async () => {
    const rect = makeRect('rect-stream-1');
    const ops: DrawOp[] = [{ op: 'add', element: rect }];

    const stream = createMockDrawOpStream(ops);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const receivedOps: DrawOp[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        receivedOps.push(JSON.parse(data) as DrawOp);
      }
    }

    expect(receivedOps).toHaveLength(1);
    expect(receivedOps[0]!.op).toBe('add');
  });

  it('applies streamed DrawOps to whiteboard store', () => {
    const store = createMockWhiteboardStore();
    const rect = makeRect('rect-applied-1');

    store.applyOps([{ op: 'add', element: rect }]);
    expect(store.getElements().has('rect-applied-1')).toBe(true);
    expect(store.getElements().get('rect-applied-1')!.id).toBe('rect-applied-1');

    // Update operation
    store.applyOps([{ op: 'update', id: 'rect-applied-1', patch: { x: 500 } }]);
    expect(store.getElements().get('rect-applied-1')!.x).toBe(500);

    // Delete operation
    store.applyOps([{ op: 'delete', id: 'rect-applied-1' }]);
    expect(store.getElements().has('rect-applied-1')).toBe(false);
  });

  it('handles clear operation', () => {
    const store = createMockWhiteboardStore([
      makeRect('r1'),
      makeRect('r2'),
      makeRect('r3'),
    ]);
    expect(store.getElements().size).toBe(3);

    store.applyOps([{ op: 'clear' }]);
    expect(store.getElements().size).toBe(0);
  });

  // ── Text streaming with delimiters ──────────────────────────

  it('extracts drawing commands from streamed text with delimiters', () => {
    const drawCmd = JSON.stringify({
      action: 'create',
      objects: [{ type: 'rect', id: 'rect-1', props: { x: 100, y: 200 } }],
    });

    const fullText = `Here is your rectangle. [DRAW_START]${drawCmd}[DRAW_END] All done!`;

    // Simulate the extraction logic from useTextMode
    const DRAW_START = '[DRAW_START]';
    const DRAW_END = '[DRAW_END]';
    const startIdx = fullText.indexOf(DRAW_START);
    const endIdx = fullText.indexOf(DRAW_END);

    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);

    const jsonStr = fullText.slice(startIdx + DRAW_START.length, endIdx).trim();
    const parsed = JSON.parse(jsonStr) as unknown as { action: string; objects: { type: string }[] };
    expect(parsed.action).toBe('create');
    expect(parsed.objects).toHaveLength(1);
    expect(parsed.objects[0]!.type).toBe('rect');
  });

  it('extracts reasoning data from streamed text', () => {
    const reasoning = JSON.stringify({
      steps: ['Analyzing the request...', 'Placing rectangle at center'],
      confidence: 0.92,
    });

    const fullText = `Let me think. [REASONING_START]${reasoning}[REASONING_END] Done.`;

    const REASONING_START = '[REASONING_START]';
    const REASONING_END = '[REASONING_END]';
    const startIdx = fullText.indexOf(REASONING_START);
    const endIdx = fullText.indexOf(REASONING_END);

    const jsonStr = fullText.slice(startIdx + REASONING_START.length, endIdx).trim();
    const parsed = JSON.parse(jsonStr) as unknown as { steps: string[]; confidence: number };
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.confidence).toBe(0.92);
  });

  it('strips delimiters from clean text output', () => {
    const drawCmd = '{"action":"create","objects":[]}';
    const reasoning = '{"steps":["thinking"],"confidence":0.9}';
    const text = `Hello [DRAW_START]${drawCmd}[DRAW_END] world [REASONING_START]${reasoning}[REASONING_END] done`;

    const clean = text
      .replace(/\[DRAW_START\][\s\S]*?\[DRAW_END\]/g, '')
      .replace(/\[REASONING_START\][\s\S]*?\[REASONING_END\]/g, '')
      .trim();

    expect(clean).toBe('Hello  world  done');
    expect(clean).not.toContain('[DRAW_START]');
    expect(clean).not.toContain('[REASONING_START]');
  });

  // ── Full conversation flow ──────────────────────────────────

  it('manages complete text conversation with multiple turns', () => {
    const store = useConversationStore.getState();

    // Turn 1: user message
    const _msg1 = store.addMessage('Draw a blue rectangle', MessageRole.USER, {
      source: InteractionMode.TEXT,
    });

    // Turn 1: assistant response placeholder
    store.setProcessing(true);
    const msg2 = store.addMessage('', MessageRole.ASSISTANT, {
      source: InteractionMode.TEXT,
      meta: { streamComplete: false },
    });

    // Turn 1: stream completes
    store.updateMessage(msg2.id, {
      content: "I've drawn a blue rectangle.",
      drawing: {
        action: 'create',
        objects: [{ type: 'rect', id: 'rect-1', props: { fill: '#3B82F6' } }],
      },
      meta: { streamComplete: true, drawObjectIds: ['rect-1'] },
    });
    store.setProcessing(false);

    // Turn 2: user follow-up
    const _msg3 = store.addMessage('Make it bigger', MessageRole.USER, {
      source: InteractionMode.TEXT,
    });

    const messages = useConversationStore.getState().messages;
    expect(messages).toHaveLength(3);
    expect(messages[0]!.role).toBe(MessageRole.USER);
    expect(messages[1]!.role).toBe(MessageRole.ASSISTANT);
    expect(messages[1]!.content).toBe("I've drawn a blue rectangle.");
    expect(messages[1]!.drawing?.action).toBe('create');
    expect(messages[1]!.meta?.streamComplete).toBe(true);
    expect(messages[2]!.content).toBe('Make it bigger');
  });

  it('adds reasoning message after extracting reasoning data', () => {
    const store = useConversationStore.getState();

    store.addMessage('Draw a flowchart', MessageRole.USER);

    const _assistantMsg = store.addMessage(
      "Here's your flowchart",
      MessageRole.ASSISTANT,
    );

    // Reasoning extracted from stream
    store.addMessage(
      'Analyzing the request...\nPlanning shape placement...',
      MessageRole.REASONING,
      {
        source: InteractionMode.TEXT,
      },
    );

    const messages = useConversationStore.getState().messages;
    expect(messages).toHaveLength(3);
    expect(messages[2]!.role).toBe(MessageRole.REASONING);
    expect(messages[2]!.content).toContain('Analyzing');
  });

  // ── Mock OpenAI client integration ──────────────────────────

  it('processes mock OpenAI streaming events end-to-end', async () => {
    const client = createMockOpenAIClient();
    const stream = client.responses.create({ model: 'gpt-5.2', input: 'test' }) as unknown as AsyncIterable<Record<string, unknown>>;

    const events: Record<string, unknown>[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[0]!.type).toBe('response.output_item.added');

    // Find the done event with full arguments
    const doneEvent = events.find(
      (e) => e.type === 'response.function_call_arguments.done',
    );
    expect(doneEvent).toBeDefined();

    const args = JSON.parse(doneEvent!.arguments as string) as unknown as { canvas: unknown; elements: { type: string }[] };
    expect(args.canvas).toBeDefined();
    expect(args.elements).toHaveLength(1);
    expect(args.elements[0]!.type).toBe('rectangle');
  });

  it('handles draw tool fixture creation', () => {
    const fixture = createDrawToolFixture({
      elements: [
        { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 },
        { id: 'e1', type: 'ellipse', x: 200, y: 200, width: 60, height: 40 },
      ],
    });

    expect(fixture.canvas.width).toBe(1920);
    expect(fixture.canvas.height).toBe(1080);
    expect(fixture.elements).toHaveLength(2);
  });

  // ── Drawing session store integration ───────────────────────

  it('tracks tool calls in drawing session store', () => {
    const sessionStore = useDrawingSessionStore.getState();
    const rect = makeRect('session-rect-1');

    sessionStore.addToolCall([{ op: 'add', element: rect }]);

    const state = useDrawingSessionStore.getState();
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolLoopIteration).toBe(1);

    // Commit ops to snapshot
    sessionStore.commitOps([{ op: 'add', element: rect }]);
    const updated = useDrawingSessionStore.getState();
    expect(updated.canvasSnapshot).toHaveLength(1);
    expect(updated.canvasSnapshot[0]!.id).toBe('session-rect-1');
  });

  it('manages drawing state transitions in session store', () => {
    const sessionStore = useDrawingSessionStore.getState();

    sessionStore.setDrawingState({ status: 'processing', prompt: 'test', requestId: 'r1' });
    expect(useDrawingSessionStore.getState().drawingState.status).toBe('processing');

    sessionStore.setDrawingState({ status: 'idle' });
    expect(useDrawingSessionStore.getState().drawingState.status).toBe('idle');
  });

  // ── SSE body creation ───────────────────────────────────────

  it('creates valid SSE body from ops', () => {
    const body = createSSEBody([
      { op: 'add', element: { id: 'r1', type: 'rect' } },
      { op: 'delete', id: 'r1' },
    ]);

    expect(body).toContain('data: ');
    expect(body).toContain('[DONE]');

    const lines = body.split('\n').filter((l) => l.startsWith('data: '));
    expect(lines).toHaveLength(3); // 2 ops + [DONE]
  });

  // ── Mock fetch integration ──────────────────────────────────

  it('creates mock fetch with SSE stream response', async () => {
    const ops: DrawOp[] = [{ op: 'add', element: makeRect('fetch-rect') }];
    const stream = createMockDrawOpStream(ops);
    const mockFetch = createMockFetch(stream);

    const response = await mockFetch('/api/draw', { method: 'POST' }) as unknown as { ok: boolean; status: number; headers: { get: (key: string) => string | null }; body: unknown };
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.body).toBeDefined();
  });

  // ── Error handling in text flow ─────────────────────────────

  it('handles stream error by updating assistant message', () => {
    const store = useConversationStore.getState();
    store.setProcessing(true);

    const _assistantMsg = store.addMessage('', MessageRole.ASSISTANT, {
      meta: { streamComplete: false },
    });

    // Simulate error
    const msgId = (_assistantMsg as unknown as { id: string }).id;
    store.updateMessage(msgId, {
      content: 'Error: Rate limit exceeded',
      meta: { streamComplete: true },
    });
    store.setProcessing(false);

    const messages = useConversationStore.getState().messages;
    expect(messages[0]!.content).toContain('Error');
    expect(messages[0]!.meta?.streamComplete).toBe(true);
    expect(useConversationStore.getState().isProcessing).toBe(false);
  });

  it('handles state machine error with retry', () => {
    let state: WhiteboardState = { status: 'idle' };

    state = transition(state, { type: 'SUBMIT_PROMPT', prompt: 'test' });
    expect(state.status).toBe('processing');

    // Error occurs
    state = transition(state, {
      type: 'ERROR',
      message: 'API timeout',
      retryable: true,
    });
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.retryable).toBe(true);
      expect(state.previousStatus).toBe('processing');
    }

    // Retry
    state = transition(state, { type: 'RETRY' });
    expect(state.status).toBe('idle');
  });

  it('rejects retry on non-retryable errors', () => {
    let state: WhiteboardState = {
      status: 'error',
      message: 'Fatal error',
      retryable: false,
      previousStatus: 'processing',
    };

    state = transition(state, { type: 'RETRY' });
    expect(state.status).toBe('error'); // Should remain in error
  });
});
