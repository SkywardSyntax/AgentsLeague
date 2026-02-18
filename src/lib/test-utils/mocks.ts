/**
 * Test mocks for the AI Whiteboard application.
 *
 * - Mock OpenAI client (client.responses.create returns SSE stream)
 * - Mock canvas 2D context
 * - Mock Web Speech API
 * - msw (Mock Service Worker) handler setup for API routes
 */

import { vi } from 'vitest';
import type { DrawToolArgs } from '@/lib/openai/tools';

// ── Mock Canvas 2D Context ──────────────────────────────────────────

export interface MockCanvasContext extends CanvasRenderingContext2D {
  readonly __calls: string[];
}

const CANVAS_METHODS = [
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
  'ellipse', 'rect', 'fill', 'stroke', 'save', 'restore',
  'translate', 'rotate', 'scale', 'setTransform', 'resetTransform',
  'clearRect', 'fillRect', 'strokeRect', 'fillText', 'strokeText',
  'setLineDash', 'getLineDash', 'quadraticCurveTo', 'bezierCurveTo',
  'drawImage', 'clip', 'createLinearGradient', 'createRadialGradient',
  'createPattern', 'getImageData', 'putImageData',
] as const;

export function createMockCanvasContext(): MockCanvasContext {
  const calls: string[] = [];

  const target: Record<string, unknown> = {
    __calls: calls,
    canvas: {
      width: 1920,
      height: 1080,
      style: { width: '', height: '' },
      getContext: () => null,
    },
    measureText: (text: string) => {
      calls.push(`measureText:${text}`);
      return { width: text.length * 8, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 };
    },
    getLineDash: () => {
      calls.push('getLineDash()');
      return [];
    },
    createLinearGradient: () => ({
      addColorStop: vi.fn(),
    }),
    createRadialGradient: () => ({
      addColorStop: vi.fn(),
    }),
  };

  for (const m of CANVAS_METHODS) {
    if (!(m in target)) {
      target[m] = vi.fn((...args: unknown[]) => {
        calls.push(`${m}(${args.map(String).join(',')})`);
      });
    }
  }

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return t[prop] ?? '';
    },
    set(t, prop: string, value) {
      calls.push(`set:${prop}=${String(value)}`);
      t[prop] = value;
      return true;
    },
  };

  return new Proxy(target, handler) as unknown as MockCanvasContext;
}

// ── Mock OpenAI Client ──────────────────────────────────────────────

export interface MockOpenAIStreamEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Create a mock OpenAI client whose `responses.create` returns
 * an async iterable of SSE-style events.
 */
export function createMockOpenAIClient(events?: MockOpenAIStreamEvent[]) {
  const defaultEvents: MockOpenAIStreamEvent[] = events ?? [
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'function_call', name: 'draw', call_id: 'call_001' },
    },
    {
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: '{"canvas":{"width":1920,"height":1080},"elements":[',
    },
    {
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: '{"id":"rect-1","type":"rectangle","x":100,"y":200,"width":300,"height":150}',
    },
    {
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: ']}',
    },
    {
      type: 'response.function_call_arguments.done',
      output_index: 0,
      arguments: JSON.stringify({
        canvas: { width: 1920, height: 1080 },
        elements: [{ id: 'rect-1', type: 'rectangle', x: 100, y: 200, width: 300, height: 150 }],
      }),
    },
    { type: 'response.completed' },
  ];

  const createStream = vi.fn().mockImplementation(() => {
    let idx = 0;
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (idx < defaultEvents.length) {
              return { value: defaultEvents[idx++], done: false };
            }
            return { value: undefined, done: true };
          },
        };
      },
    };
  });

  return {
    responses: {
      create: createStream,
    },
    _events: defaultEvents,
    _createStream: createStream,
  };
}

// ── Mock Web Speech API ─────────────────────────────────────────────

export interface MockSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  simulateResult: (transcript: string, isFinal: boolean, confidence?: number) => void;
  simulateError: (error: string) => void;
  simulateEnd: () => void;
}

export function createMockSpeechRecognition(): MockSpeechRecognition {
  const instance: MockSpeechRecognition = {
    continuous: false,
    interimResults: false,
    lang: 'en-US',
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),

    simulateResult(transcript: string, isFinal: boolean, confidence = 0.95) {
      const event = {
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal,
            length: 1,
            0: { transcript, confidence },
          },
        },
      };
      instance.onresult?.(event);
    },

    simulateError(error: string) {
      instance.onerror?.({ error });
    },

    simulateEnd() {
      instance.onend?.();
    },
  };

  return instance;
}

export function installMockSpeechRecognition(): {
  mock: MockSpeechRecognition;
  cleanup: () => void;
} {
  const mock = createMockSpeechRecognition();
  const SRConstructor = vi.fn(() => mock);

  const prev = (globalThis as Record<string, unknown>).webkitSpeechRecognition;
  (globalThis as Record<string, unknown>).webkitSpeechRecognition = SRConstructor;

  return {
    mock,
    cleanup: () => {
      (globalThis as Record<string, unknown>).webkitSpeechRecognition = prev;
    },
  };
}

// ── MSW Handler Factories ───────────────────────────────────────────

/**
 * Create SSE response body from draw tool arguments.
 * Compatible with the /api/draw endpoint format.
 */
export function createSSEBody(ops: Array<{ op: string; [key: string]: unknown }>): string {
  return ops.map((op) => `data: ${JSON.stringify(op)}\n\n`).join('') + 'data: [DONE]\n\n';
}

/**
 * Create a draw tool response fixture.
 */
export function createDrawToolFixture(args?: Partial<DrawToolArgs>): DrawToolArgs {
  return {
    canvas: { width: 1920, height: 1080 },
    elements: [
      { id: 'rect-1', type: 'rectangle', x: 100, y: 200, width: 300, height: 150 },
    ],
    ...args,
  };
}
