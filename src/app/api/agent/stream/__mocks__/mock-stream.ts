/**
 * Mock agent stream for e2e testing.
 * Returns deterministic SSE responses without any OpenAI API calls.
 * Gated by server-only env AGENT_STREAM_MODE=mock (never NEXT_PUBLIC_*).
 */

import { formatSSE, sseHeaders } from '@/lib/server/sse';

interface MockElement {
  type: string;
  [key: string]: unknown;
}

interface MockBatch {
  batch_id: string;
  elements: MockElement[];
}

const MOCK_BATCHES: Record<string, MockBatch> = {
  biology: {
    batch_id: 'mock-bio-1',
    elements: [
      { id: 'mb-1', type: 'rect', x: 100, y: 100, w: 200, h: 120, color: '#388e3c' },
      { id: 'mb-2', type: 'text', x: 150, y: 140, text: 'Cell Membrane', size: 16 },
      { id: 'mb-3', type: 'ellipse', cx: 200, cy: 200, rx: 40, ry: 25, color: '#4caf50' },
    ],
  },
  art: {
    batch_id: 'mock-art-1',
    elements: [
      { id: 'ma-1', type: 'rect', x: 100, y: 100, w: 300, h: 200, color: '#e65100' },
      { id: 'ma-2', type: 'line', from: { x: 100, y: 200 }, to: { x: 400, y: 150 }, color: '#ff6d00' },
      { id: 'ma-3', type: 'text', x: 200, y: 260, text: 'Mountain Skyline', size: 14 },
    ],
  },
  math: {
    batch_id: 'mock-math-1',
    elements: [
      { id: 'mm-1', type: 'rect', x: 100, y: 100, w: 250, h: 180, color: '#1565c0' },
      { id: 'mm-2', type: 'text', x: 150, y: 140, text: 'Unit Circle', size: 16 },
      { id: 'mm-3', type: 'ellipse', cx: 225, cy: 220, rx: 60, ry: 60, color: '#1976d2' },
    ],
  },
  physics: {
    batch_id: 'mock-phys-1',
    elements: [
      { id: 'mp-1', type: 'rect', x: 100, y: 100, w: 280, h: 160, color: '#c62828' },
      { id: 'mp-2', type: 'arrow', from: { x: 150, y: 200 }, to: { x: 350, y: 140 }, color: '#d32f2f' },
      { id: 'mp-3', type: 'text', x: 180, y: 230, text: 'Force Vector', size: 14 },
    ],
  },
};

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  biology: ['cell', 'neuron', 'dna', 'mitochondri', 'leaf', 'ribosome', 'synapse', 'chloroplast', 'blood', 'virus', 'enzyme', 'muscle', 'root', 'biology'],
  art: ['mountain', 'abstract', 'portrait', 'flower', 'mosaic', 'ocean', 'city', 'mandala', 'autumn', 'starry', 'sand', 'compose', 'paint', 'art'],
  math: ['circle', 'parabola', 'triangle', 'matrix', 'venn', 'number line', 'sine', 'fractal', 'coordinate', 'histogram', 'tessellation', 'plot', 'graph', 'math'],
  physics: ['free-body', 'circuit', 'projectile', 'wave', 'pendulum', 'magnetic', 'lens', 'heat', 'spring', 'capacitor', 'standing', 'physics'],
};

let passthroughTurnCounter = 0;
let passthroughMsgCounter = 0;
let mockTurnCounter = 0;
let mockMsgCounter = 0;

function detectDomain(query: string): string {
  const lower = query.toLowerCase();
  let bestDomain = 'math';
  let bestScore = 0;
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }
  return bestDomain;
}

export function isMockMode(): boolean {
  return process.env.AGENT_STREAM_MODE === 'mock' || process.env.AGENT_STREAM_MODE === 'passthrough';
}

export function isPassthroughMode(): boolean {
  return process.env.AGENT_STREAM_MODE === 'passthrough';
}

/**
 * Passthrough mode: echoes a batch from the request body as SSE.
 * Enables per-test scenario control without env var switching or server restart.
 * The request body must include a `passthroughBatch` field with the batch to echo.
 * Optionally include `passthroughError` to simulate an error event.
 */
export function passthroughAgentStream(body: {
  userMessage: string;
  passthroughBatch?: Record<string, unknown>;
  passthroughError?: string;
}): Response {
  const turnId = `passthrough-turn-${++passthroughTurnCounter}`;
  const messageId = `passthrough-msg-${++passthroughMsgCounter}`;
  const textReply = `Passthrough response for: ${body.userMessage.slice(0, 80)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(formatSSE(payload)));
      };

      await delay(20);
      send({ type: 'assistant.text.delta', turnId, delta: textReply });

      await delay(20);
      send({ type: 'assistant.text.done', turnId, messageId });

      if (body.passthroughError) {
        await delay(20);
        send({ type: 'error', message: body.passthroughError });
        controller.close();
        return;
      }

      if (body.passthroughBatch) {
        await delay(20);
        send({ type: 'whiteboard.batch', turnId, batch: body.passthroughBatch });
      }

      await delay(20);
      send({ type: 'turn.done', turnId, usage: { prompt: 0, completion: 0, total: 0 } });

      controller.close();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

export function mockAgentStream(body: { userMessage: string }): Response {
  const domain = detectDomain(body.userMessage);
  const batch = MOCK_BATCHES[domain] ?? MOCK_BATCHES['math']!;
  const textReply = `Here is a ${domain} diagram for: ${body.userMessage.slice(0, 80)}`;
  const turnId = `mock-turn-${++mockTurnCounter}`;
  const messageId = `mock-msg-${++mockMsgCounter}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(formatSSE(payload)));
      };

      // Simulate realistic SSE sequence matching AgentSSEEvent types
      await delay(50);
      send({ type: 'assistant.text.delta', turnId, delta: textReply.slice(0, 20) });

      await delay(80);
      send({ type: 'assistant.text.delta', turnId, delta: textReply.slice(20) });

      await delay(60);
      send({ type: 'assistant.text.done', turnId, messageId });

      await delay(100);
      send({ type: 'whiteboard.batch', turnId, batch });

      await delay(50);
      send({ type: 'turn.done', turnId, usage: { prompt: 100, completion: 50, total: 150 } });

      controller.close();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
