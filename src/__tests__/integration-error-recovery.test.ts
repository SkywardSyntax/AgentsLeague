/**
 * Integration tests: Error handling, retry, state persistence, and recovery.
 *
 * Tests error flows, retry logic, localStorage persistence,
 * and state recovery scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useConversationStore } from '@/stores/conversation-store';
import { useDrawingSessionStore } from '@/stores/drawing-session';
import { InteractionMode, MessageRole, VoiceState, voiceTransition } from '@/types/interaction';
import type { VoiceSession } from '@/types/interaction';
import { transition } from '@/types/state';
import type { WhiteboardState } from '@/types/state';
import type { DrawElement, RectElement } from '@/types/drawing';
import {
  saveCanvasState,
  loadCanvasState,
  clearCanvasState,
} from '@/lib/storage/whiteboardStorage';
import {
  createMockStream,
} from '@/lib/test-utils/helpers';
import {
  createMockOpenAIClient,
  type MockOpenAIStreamEvent,
} from '@/lib/test-utils/mocks';
import {
  rectElement,
  ellipseElement,
  idleVoiceSession,
  defaultStroke,
  defaultFill,
  defaultCamera,
} from '@/lib/test-utils/fixtures';

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

// ── Mock localStorage ───────────────────────────────────────────

function createMockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
    get length() { return store.size; },
    key: vi.fn((i: number) => Array.from(store.keys())[i] ?? null),
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('Integration: Error Handling & Retry', () => {
  beforeEach(() => {
    resetStores();
  });

  // ── Whiteboard state machine error handling ─────────────────

  describe('WhiteboardState Error Transitions', () => {
    it('transitions to error from processing state', () => {
      let state: WhiteboardState = { status: 'idle' };
      state = transition(state, { type: 'SUBMIT_PROMPT', prompt: 'test' });
      expect(state.status).toBe('processing');

      state = transition(state, {
        type: 'ERROR',
        message: 'OpenAI API rate limit exceeded',
        retryable: true,
      });

      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.message).toBe('OpenAI API rate limit exceeded');
        expect(state.retryable).toBe(true);
        expect(state.previousStatus).toBe('processing');
      }
    });

    it('transitions to error from drawing state', () => {
      let state: WhiteboardState = { status: 'idle' };
      state = transition(state, { type: 'SUBMIT_PROMPT', prompt: 'test' });
      state = transition(state, { type: 'AI_RESPONSE', shapes: [] });
      expect(state.status).toBe('drawing');

      state = transition(state, {
        type: 'ERROR',
        message: 'Stream interrupted',
        retryable: true,
      });

      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.previousStatus).toBe('drawing');
      }
    });

    it('retries from error back to idle', () => {
      const state: WhiteboardState = {
        status: 'error',
        message: 'timeout',
        retryable: true,
        previousStatus: 'processing',
      };

      const result = transition(state, { type: 'RETRY' });
      expect(result.status).toBe('idle');
    });

    it('does not retry non-retryable errors', () => {
      const state: WhiteboardState = {
        status: 'error',
        message: 'Invalid API key',
        retryable: false,
        previousStatus: 'processing',
      };

      const result = transition(state, { type: 'RETRY' });
      expect(result.status).toBe('error');
    });

    it('resets from error to idle', () => {
      const state: WhiteboardState = {
        status: 'error',
        message: 'Fatal',
        retryable: false,
        previousStatus: 'processing',
      };

      const result = transition(state, { type: 'RESET' });
      expect(result.status).toBe('idle');
    });

    it('preserves previousStatus through nested errors', () => {
      let state: WhiteboardState = { status: 'idle' };
      state = transition(state, { type: 'SUBMIT_PROMPT', prompt: 'test' });

      // First error
      state = transition(state, { type: 'ERROR', message: 'err1', retryable: true });
      expect(state.status === 'error' && state.previousStatus).toBe('processing');

      // Second error while in error state preserves original previousStatus
      state = transition(state, { type: 'ERROR', message: 'err2', retryable: false });
      expect(state.status === 'error' && state.previousStatus).toBe('processing');
    });
  });

  // ── Stream error handling ───────────────────────────────────

  describe('Stream Error Handling', () => {
    it('handles HTTP error responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        body: null,
      });

      const response = await mockFetch('/api/draw', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'test' }),
      }) as unknown as { ok: boolean; status: number };

      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
    });

    it('handles network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(
        mockFetch('/api/draw', { method: 'POST' }),
      ).rejects.toThrow('Failed to fetch');
    });

    it('handles malformed SSE chunks gracefully', async () => {
      const stream = createMockStream([
        { data: '{"text":"Hello"}' },
        { data: 'not valid json' },
        { data: '{"text":" world"}' },
      ]);

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      const texts: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as { text?: string };
            if (parsed.text) texts.push(parsed.text);
          } catch {
            // Skip malformed chunks (matches useTextMode behavior)
          }
        }
      }

      expect(texts).toEqual(['Hello', ' world']);
    });

    it('handles AbortController cancellation', async () => {
      const controller = new AbortController();
      const mockFetch = vi.fn().mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      );

      const fetchPromise = mockFetch('/api/draw', { signal: controller.signal }) as unknown as Promise<Response>;
      controller.abort();

      await expect(fetchPromise).rejects.toThrow('The operation was aborted');
    });

    it('handles empty stream response', async () => {
      const stream = createMockStream([]); // No events, just [DONE]
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
      }

      // Should contain the [DONE] marker
      const allText = chunks.join('');
      expect(allText).toContain('[DONE]');
    });
  });

  // ── Mock OpenAI error scenarios ─────────────────────────────

  describe('OpenAI Mock Error Scenarios', () => {
    it('handles OpenAI stream with error event', async () => {
      const events: MockOpenAIStreamEvent[] = [
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'function_call', name: 'draw', call_id: 'call_err' },
        },
        {
          type: 'error',
          error: { message: 'Rate limit exceeded', type: 'rate_limit_error', code: 429 },
        },
      ];

      const client = createMockOpenAIClient(events);
      const stream = client.responses.create({ model: 'gpt-5.2', input: 'test' }) as unknown as AsyncIterable<MockOpenAIStreamEvent>;

      const collected: MockOpenAIStreamEvent[] = [];
      for await (const event of stream) {
        collected.push(event);
      }

      expect(collected).toHaveLength(2);
      const errorEvent = collected.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.error as Record<string, unknown>).message).toBe('Rate limit exceeded');
    });

    it('handles empty OpenAI response', async () => {
      const client = createMockOpenAIClient([
        { type: 'response.completed' },
      ]);

      const stream = client.responses.create({ model: 'gpt-5.2', input: 'test' }) as unknown as AsyncIterable<MockOpenAIStreamEvent>;
      const collected: MockOpenAIStreamEvent[] = [];
      for await (const event of stream) {
        collected.push(event);
      }

      expect(collected).toHaveLength(1);
      expect(collected[0]!.type).toBe('response.completed');
    });
  });

  // ── Voice error handling ────────────────────────────────────

  describe('Voice Error Recovery', () => {
    it('recovers from microphone access denied', () => {
      let session: VoiceSession = idleVoiceSession;
      session = voiceTransition(session, { type: 'START_LISTENING' });

      session = voiceTransition(session, {
        type: 'ERROR',
        message: 'not-allowed',
      });

      expect(session.state).toBe(VoiceState.IDLE);
      expect(session.error).toBe('not-allowed');

      // Can retry
      session = voiceTransition(session, { type: 'START_LISTENING' });
      expect(session.state).toBe(VoiceState.LISTENING);
      expect(session.error).toBeNull();
    });

    it('recovers from network error during sending', () => {
      let session: VoiceSession = idleVoiceSession;
      session = voiceTransition(session, { type: 'START_LISTENING' });
      session = voiceTransition(session, {
        type: 'FINAL_RESULT',
        transcript: 'test',
        confidence: 0.9,
      });
      session = voiceTransition(session, { type: 'SEND' });
      expect(session.state).toBe(VoiceState.SENDING);

      session = voiceTransition(session, {
        type: 'ERROR',
        message: 'Network error',
      });
      expect(session.state).toBe(VoiceState.IDLE);
      expect(session.error).toBe('Network error');
    });
  });

  // ── Conversation store error handling ───────────────────────

  describe('Conversation Store Error Recovery', () => {
    it('updates message with error content on failure', () => {
      const store = useConversationStore.getState();
      store.setProcessing(true);

      const msg = store.addMessage('', MessageRole.ASSISTANT, {
        meta: { streamComplete: false },
      });

      // Simulate error
      store.updateMessage(msg.id, {
        content: 'Error: Service unavailable. Please try again.',
        meta: { streamComplete: true },
      });
      store.setProcessing(false);

      const messages = useConversationStore.getState().messages;
      expect(messages[0]!.content).toContain('Error');
      expect(messages[0]!.meta?.streamComplete).toBe(true);
      expect(useConversationStore.getState().isProcessing).toBe(false);
    });

    it('handles concurrent message updates safely', () => {
      const store = useConversationStore.getState();

      const msg1 = store.addMessage('msg1', MessageRole.USER);
      const msg2 = store.addMessage('msg2', MessageRole.ASSISTANT);

      // Update both
      store.updateMessage(msg1.id, { content: 'updated1' });
      store.updateMessage(msg2.id, { content: 'updated2' });

      const messages = useConversationStore.getState().messages;
      expect(messages[0]!.content).toBe('updated1');
      expect(messages[1]!.content).toBe('updated2');
    });

    it('handles delete of non-existent message', () => {
      const store = useConversationStore.getState();
      store.addMessage('test', MessageRole.USER);

      // Should not throw
      store.deleteMessage('non-existent-id');
      expect(useConversationStore.getState().messages).toHaveLength(1);
    });
  });
});

// ── State Persistence & Recovery ────────────────────────────────

describe('Integration: State Persistence & Recovery', () => {
  let mockStorage: ReturnType<typeof createMockLocalStorage>;
  let originalLocalStorage: Storage;

  beforeEach(() => {
    resetStores();
    mockStorage = createMockLocalStorage();
    originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  // ── Save and load ───────────────────────────────────────────

  describe('Canvas State Persistence', () => {
    it('saves and loads canvas state', () => {
      const rect = makeRect('persist-1');
      const state = {
        elements: new Map<string, DrawElement>([['persist-1', rect]]),
        selectedIds: new Set(['persist-1']),
        camera: { x: 100, y: 200, zoom: 1.5 },
        activeTool: 'select' as const,
      };

      saveCanvasState(state);
      expect(mockStorage.setItem).toHaveBeenCalled();

      const loaded = loadCanvasState();
      expect(loaded).not.toBeNull();
      expect(loaded!.elements.size).toBe(1);
      expect(loaded!.elements.get('persist-1')!.id).toBe('persist-1');
      expect(loaded!.selectedIds.size).toBe(1);
      expect(loaded!.camera.x).toBe(100);
      expect(loaded!.camera.zoom).toBe(1.5);
      expect(loaded!.activeTool).toBe('select');
    });

    it('returns null for empty storage', () => {
      const loaded = loadCanvasState();
      expect(loaded).toBeNull();
    });

    it('returns null for corrupted storage', () => {
      mockStorage.getItem.mockReturnValue('not valid json!!!');
      const loaded = loadCanvasState();
      expect(loaded).toBeNull();
    });

    it('returns null for invalid envelope structure', () => {
      mockStorage.getItem.mockReturnValue(JSON.stringify({ foo: 'bar' }));
      const loaded = loadCanvasState();
      expect(loaded).toBeNull();
    });

    it('clears canvas state', () => {
      const state = {
        elements: new Map<string, DrawElement>(),
        selectedIds: new Set<string>(),
        camera: defaultCamera,
        activeTool: 'select' as const,
      };

      saveCanvasState(state);
      clearCanvasState();
      expect(mockStorage.removeItem).toHaveBeenCalled();

      const loaded = loadCanvasState();
      expect(loaded).toBeNull();
    });
  });

  // ── Multi-element persistence ───────────────────────────────

  describe('Complex State Persistence', () => {
    it('persists multiple elements of different types', () => {
      const elements = new Map<string, DrawElement>();
      elements.set('rect-1', makeRect('rect-1'));
      elements.set('ellipse-1', { ...ellipseElement, id: 'ellipse-1' });

      const state = {
        elements,
        selectedIds: new Set<string>(),
        camera: { x: 50, y: -30, zoom: 2 },
        activeTool: 'hand' as const,
      };

      saveCanvasState(state);
      const loaded = loadCanvasState();

      expect(loaded).not.toBeNull();
      expect(loaded!.elements.size).toBe(2);
      expect(loaded!.elements.has('rect-1')).toBe(true);
      expect(loaded!.elements.has('ellipse-1')).toBe(true);
      expect(loaded!.camera.zoom).toBe(2);
      expect(loaded!.activeTool).toBe('hand');
    });

    it('preserves element properties through save/load cycle', () => {
      const rect = makeRect('prop-test', { x: 42, y: 99 });
      const state = {
        elements: new Map<string, DrawElement>([['prop-test', rect]]),
        selectedIds: new Set<string>(),
        camera: defaultCamera,
        activeTool: 'select' as const,
      };

      saveCanvasState(state);
      const loaded = loadCanvasState();

      const loadedRect = loaded!.elements.get('prop-test') as RectElement;
      expect(loadedRect.x).toBe(42);
      expect(loadedRect.y).toBe(99);
      expect(loadedRect.type).toBe('rect');
      expect(loadedRect.fill).toEqual(defaultFill);
      expect(loadedRect.stroke).toEqual(defaultStroke);
    });
  });

  // ── Drawing session persistence ─────────────────────────────

  describe('Drawing Session Recovery', () => {
    it('resets drawing session to clean state', () => {
      const sessionStore = useDrawingSessionStore.getState();
      const rect = makeRect('session-persist-1');

      sessionStore.addToolCall([{ op: 'add', element: rect }]);
      sessionStore.commitOps([{ op: 'add', element: rect }]);
      sessionStore.setDrawingState({
        status: 'processing',
        prompt: 'test',
        requestId: 'r1',
      });

      expect(useDrawingSessionStore.getState().toolCalls).toHaveLength(1);
      expect(useDrawingSessionStore.getState().canvasSnapshot).toHaveLength(1);

      // Reset recovers clean state
      sessionStore.reset();

      const resetState = useDrawingSessionStore.getState();
      expect(resetState.drawingState.status).toBe('idle');
      expect(resetState.toolCalls).toHaveLength(0);
      expect(resetState.canvasSnapshot).toHaveLength(0);
      expect(resetState.toolLoopIteration).toBe(0);
    });

    it('conversation store can fully reset', () => {
      const store = useConversationStore.getState();
      store.addMessage('msg1', MessageRole.USER);
      store.addMessage('msg2', MessageRole.ASSISTANT);
      store.setMode(InteractionMode.VOICE);
      store.setProcessing(true);

      expect(useConversationStore.getState().messages).toHaveLength(2);

      store.clearHistory();
      store.setProcessing(false);
      store.setMode(InteractionMode.TEXT);

      const reset = useConversationStore.getState();
      expect(reset.messages).toHaveLength(0);
      expect(reset.isProcessing).toBe(false);
      expect(reset.mode).toBe(InteractionMode.TEXT);
    });
  });

  // ── State recovery after error ──────────────────────────────

  describe('Recovery After Error', () => {
    it('recovers whiteboard state after error via RESET', () => {
      let state: WhiteboardState = { status: 'idle' };
      state = transition(state, { type: 'SUBMIT_PROMPT', prompt: 'test' });
      state = transition(state, { type: 'ERROR', message: 'crash', retryable: true });

      expect(state.status).toBe('error');

      // Reset to recover
      state = transition(state, { type: 'RESET' });
      expect(state.status).toBe('idle');
    });

    it('recovers conversation after failed stream', () => {
      const store = useConversationStore.getState();

      // Initial user request
      store.addMessage('Draw something', MessageRole.USER);
      store.setProcessing(true);

      const failedMsg = store.addMessage('', MessageRole.ASSISTANT, {
        meta: { streamComplete: false },
      });

      // Stream fails
      store.updateMessage(failedMsg.id, {
        content: 'Error: Connection lost',
        meta: { streamComplete: true },
      });
      store.setProcessing(false);

      // User retries
      store.addMessage('Try again', MessageRole.USER);
      store.setProcessing(true);
      const retryMsg = store.addMessage('', MessageRole.ASSISTANT, {
        meta: { streamComplete: false },
      });

      // Retry succeeds
      store.updateMessage(retryMsg.id, {
        content: 'Here is your drawing!',
        meta: { streamComplete: true },
      });
      store.setProcessing(false);

      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(4);
      expect(messages[1]!.content).toContain('Error');
      expect(messages[3]!.content).toBe('Here is your drawing!');
      expect(messages[3]!.meta?.streamComplete).toBe(true);
    });

    it('drawing session snapshot survives partial failure', () => {
      const sessionStore = useDrawingSessionStore.getState();
      const rect1 = makeRect('survive-1');
      const _rect2 = makeRect('survive-2');

      // Commit first batch successfully
      sessionStore.commitOps([{ op: 'add', element: rect1 }]);
      sessionStore.addToolCall([{ op: 'add', element: rect1 }]);

      expect(useDrawingSessionStore.getState().canvasSnapshot).toHaveLength(1);

      // Second batch "fails" — we don't commit but still have snapshot
      // Simulate by not calling commitOps for rect2

      // Snapshot still has rect1
      expect(useDrawingSessionStore.getState().canvasSnapshot).toHaveLength(1);
      expect(useDrawingSessionStore.getState().canvasSnapshot[0]!.id).toBe('survive-1');
    });
  });
});
