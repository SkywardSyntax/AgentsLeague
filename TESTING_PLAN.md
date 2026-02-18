# AI Whiteboard Application — Comprehensive Testing Plan

## Table of Contents

1. [Test File Structure](#test-file-structure)
2. [Unit Tests](#1-unit-tests)
3. [Integration Tests](#2-integration-tests)
4. [End-to-End Tests](#3-end-to-end-tests)
5. [Visual Regression Tests](#4-visual-regression-tests)
6. [Performance Tests](#5-performance-tests)
7. [Type Tests](#6-type-tests)
8. [Test Coverage Goals](#7-test-coverage-goals)
9. [Testing Tools & Infrastructure](#8-testing-tools--infrastructure)
10. [CI/CD Integration](#9-cicd-integration)

---

## Test File Structure

```
tests/
├── unit/
│   ├── canvas/
│   │   ├── drawing-algorithms.test.ts      # Bresenham, flood-fill, smoothing
│   │   ├── shape-rendering.test.ts          # Rectangle, ellipse, polygon, arrow
│   │   ├── hit-testing.test.ts              # Point-in-shape, bounding-box collision
│   │   ├── transform.test.ts                # Pan, zoom, rotate matrix math
│   │   └── color-utils.test.ts              # HSL/RGB conversion, opacity
│   ├── text/
│   │   ├── text-layout.test.ts              # Word wrap, line height, alignment
│   │   ├── text-measurement.test.ts         # Font metrics, bounding boxes
│   │   └── markdown-rendering.test.ts       # Inline code, bold, italic in canvas
│   ├── state/
│   │   ├── undo-redo.test.ts                # Command stack, history truncation
│   │   ├── scene-graph.test.ts              # Add, remove, reorder, group nodes
│   │   ├── selection.test.ts                # Multi-select, lasso, shift-click
│   │   └── serialization.test.ts            # Export/import JSON, versioning
│   ├── ai/
│   │   ├── prompt-builder.test.ts           # System prompt construction
│   │   ├── tool-schema-validation.test.ts   # JSON schema conformance
│   │   ├── response-parser.test.ts          # Stream chunk assembly, error recovery
│   │   └── token-counter.test.ts            # Context window budgeting
│   └── utils/
│       ├── geometry.test.ts                 # Vector math, intersection, distance
│       ├── throttle-debounce.test.ts        # Timing utilities
│       └── id-generator.test.ts             # Unique ID determinism
│
├── integration/
│   ├── openai-api/
│   │   ├── chat-completion.test.ts          # Request/response lifecycle
│   │   ├── streaming.test.ts                # SSE parsing, backpressure
│   │   ├── tool-use-workflow.test.ts        # Function calling round-trips
│   │   ├── error-handling.test.ts           # Rate limits, timeouts, retries
│   │   └── vision-input.test.ts             # Canvas screenshot → vision API
│   ├── state-management/
│   │   ├── store-sync.test.ts               # Zustand/Redux state transitions
│   │   ├── persistence.test.ts              # IndexedDB/localStorage round-trip
│   │   └── collaboration-crdt.test.ts       # Conflict-free replicated data types
│   └── voice/
│       ├── whisper-transcription.test.ts     # Audio blob → text pipeline
│       ├── realtime-api.test.ts             # WebSocket session lifecycle
│       └── voice-activity-detection.test.ts # VAD start/stop events
│
├── e2e/
│   ├── text-mode.spec.ts                   # Type prompt → AI draws on canvas
│   ├── voice-mode.spec.ts                  # Speak → transcribe → AI responds
│   ├── drawing-generation.spec.ts          # AI generates shapes from description
│   ├── manual-drawing.spec.ts              # Freehand draw, eraser, undo/redo
│   ├── export-flow.spec.ts                 # Export PNG/SVG/JSON
│   ├── collaborative-editing.spec.ts       # Multi-user concurrent editing
│   └── error-recovery.spec.ts              # Network failure, API error, reload
│
├── visual-regression/
│   ├── toolbar.spec.ts                      # Tool palette states
│   ├── canvas-shapes.spec.ts                # Rendered shape fidelity
│   ├── ai-generated-output.spec.ts          # Generated diagram consistency
│   ├── dark-mode.spec.ts                    # Theme switching
│   ├── responsive-layout.spec.ts            # Viewport breakpoints
│   └── __snapshots__/                       # Baseline screenshots
│
├── performance/
│   ├── canvas-rendering.bench.ts            # FPS under N shapes
│   ├── api-latency.bench.ts                 # TTFB, streaming throughput
│   ├── memory-usage.bench.ts                # Heap growth over time
│   ├── large-document.bench.ts              # 10k+ elements load/pan/zoom
│   └── streaming-efficiency.bench.ts        # Token throughput, jank detection
│
├── types/
│   ├── canvas-types.test-d.ts               # Shape, Tool, Layer type guards
│   ├── api-types.test-d.ts                  # OpenAI request/response types
│   ├── store-types.test-d.ts                # State slice type inference
│   └── event-types.test-d.ts                # Custom event payload types
│
├── fixtures/
│   ├── openai-responses/                    # Recorded API responses
│   │   ├── chat-completion.json
│   │   ├── tool-call-draw-rect.json
│   │   ├── streaming-chunks.ndjson
│   │   └── error-rate-limit.json
│   ├── canvas-states/                       # Serialized board snapshots
│   │   ├── empty-board.json
│   │   ├── complex-diagram.json
│   │   └── 10k-shapes.json
│   └── audio/
│       ├── short-command.webm               # "Draw a red circle"
│       └── long-dictation.webm              # Multi-sentence prompt
│
├── mocks/
│   ├── openai-server.ts                     # MSW handler for api.openai.com
│   ├── websocket-server.ts                  # Mock Realtime API WebSocket
│   ├── canvas-context.ts                    # Stub CanvasRenderingContext2D
│   └── media-devices.ts                     # Mock getUserMedia / AudioContext
│
├── helpers/
│   ├── canvas-test-utils.ts                 # Render-to-offscreen, pixel comparison
│   ├── stream-test-utils.ts                 # Create fake ReadableStream
│   ├── wait-for.ts                          # Polling helpers for async assertions
│   └── seed-board.ts                        # Programmatically populate a board
│
└── vitest.config.ts                         # Shared Vitest configuration
```

---

## 1. Unit Tests

### 1.1 Drawing Algorithms

| Test Scenario | Input | Expected Output |
|---|---|---|
| Bresenham line rasterization | `(0,0)` → `(10,5)` | Pixel array matching reference |
| Bézier curve subdivision | 4 control points | Smooth polyline within ε tolerance |
| Flood fill bounded region | Click inside closed polygon | All interior pixels colored, boundary intact |
| Stroke smoothing (Catmull-Rom) | Jittery point array | Smoothed curve with reduced point count |
| Pressure-sensitive width | Pressure values `[0.2, 0.8, 0.5]` | Linearly interpolated stroke widths |

```ts
// tests/unit/canvas/drawing-algorithms.test.ts
import { describe, it, expect } from 'vitest';
import { bresenhamLine } from '@/lib/canvas/algorithms';

describe('bresenhamLine', () => {
  it('produces correct pixels for a shallow positive slope', () => {
    const pixels = bresenhamLine({ x: 0, y: 0 }, { x: 6, y: 2 });
    expect(pixels).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 },
      { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 2 }, { x: 6, y: 2 },
    ]);
  });

  it('handles vertical lines', () => {
    const pixels = bresenhamLine({ x: 3, y: 0 }, { x: 3, y: 4 });
    expect(pixels).toHaveLength(5);
    expect(pixels.every(p => p.x === 3)).toBe(true);
  });

  it('handles zero-length lines (single point)', () => {
    const pixels = bresenhamLine({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(pixels).toEqual([{ x: 5, y: 5 }]);
  });
});
```

### 1.2 Shape Rendering

| Test Scenario | Assertion |
|---|---|
| Rectangle with border-radius | Corner arc matches radius within 1px |
| Ellipse axis-aligned | Pixels lie on ellipse equation ±1px |
| Arrow with configurable head | Head angle and length match params |
| Polygon winding order | `isClockwise()` returns correct value |
| Shape clipping to viewport | Off-screen portions excluded from draw calls |

```ts
// tests/unit/canvas/shape-rendering.test.ts
import { describe, it, expect } from 'vitest';
import { renderRectangle } from '@/lib/canvas/shapes';
import { createMockContext } from '../../mocks/canvas-context';

describe('renderRectangle', () => {
  it('draws rounded corners when borderRadius > 0', () => {
    const ctx = createMockContext();
    renderRectangle(ctx, {
      x: 10, y: 10, width: 100, height: 60, borderRadius: 8,
    });
    // arcTo is called 4 times (one per corner)
    expect(ctx.arcTo).toHaveBeenCalledTimes(4);
  });

  it('uses fill and stroke when both are specified', () => {
    const ctx = createMockContext();
    renderRectangle(ctx, {
      x: 0, y: 0, width: 50, height: 50,
      fill: '#ff0000', stroke: '#000000', strokeWidth: 2,
    });
    expect(ctx.fillStyle).toBe('#ff0000');
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});
```

### 1.3 Text Layout

```ts
// tests/unit/text/text-layout.test.ts
import { describe, it, expect } from 'vitest';
import { wrapText } from '@/lib/text/layout';

describe('wrapText', () => {
  const measureWidth = (text: string) => text.length * 8; // 8px per char

  it('wraps long lines at word boundaries', () => {
    const lines = wrapText('The quick brown fox jumps', 120, measureWidth);
    expect(lines).toEqual(['The quick brown', 'fox jumps']);
  });

  it('force-breaks words exceeding max width', () => {
    const lines = wrapText('Supercalifragilistic', 80, measureWidth);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach(line => {
      expect(measureWidth(line)).toBeLessThanOrEqual(80);
    });
  });

  it('preserves explicit newlines', () => {
    const lines = wrapText('Line1\nLine2', 200, measureWidth);
    expect(lines).toEqual(['Line1', 'Line2']);
  });
});
```

### 1.4 Undo/Redo State

```ts
// tests/unit/state/undo-redo.test.ts
import { describe, it, expect } from 'vitest';
import { CommandStack } from '@/lib/state/command-stack';

describe('CommandStack', () => {
  it('undoes the last command and restores prior state', () => {
    const stack = new CommandStack();
    stack.execute({ type: 'ADD_SHAPE', shape: { id: '1' } });
    stack.execute({ type: 'ADD_SHAPE', shape: { id: '2' } });
    const state = stack.undo();
    expect(state.shapes).toHaveLength(1);
    expect(state.shapes[0].id).toBe('1');
  });

  it('truncates future on new command after undo', () => {
    const stack = new CommandStack();
    stack.execute({ type: 'ADD_SHAPE', shape: { id: '1' } });
    stack.execute({ type: 'ADD_SHAPE', shape: { id: '2' } });
    stack.undo();
    stack.execute({ type: 'ADD_SHAPE', shape: { id: '3' } });
    expect(stack.canRedo()).toBe(false);
  });

  it('caps history at configured max depth', () => {
    const stack = new CommandStack({ maxDepth: 50 });
    for (let i = 0; i < 100; i++) {
      stack.execute({ type: 'ADD_SHAPE', shape: { id: `${i}` } });
    }
    expect(stack.depth()).toBe(50);
  });
});
```

### 1.5 AI Prompt & Response Handling

```ts
// tests/unit/ai/response-parser.test.ts
import { describe, it, expect } from 'vitest';
import { assembleStreamChunks } from '@/lib/ai/response-parser';

describe('assembleStreamChunks', () => {
  it('concatenates content deltas into full text', () => {
    const chunks = [
      { choices: [{ delta: { content: 'Draw ' } }] },
      { choices: [{ delta: { content: 'a circle' } }] },
    ];
    expect(assembleStreamChunks(chunks)).toBe('Draw a circle');
  });

  it('extracts tool_calls across multiple chunks', () => {
    const chunks = [
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'draw', arguments: '{"sha' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'pe":"rect"}' } }] } }] },
    ];
    const result = assembleStreamChunks(chunks);
    expect(result.toolCalls[0].function.name).toBe('draw');
    expect(JSON.parse(result.toolCalls[0].function.arguments)).toEqual({ shape: 'rect' });
  });

  it('handles [DONE] sentinel gracefully', () => {
    expect(() => assembleStreamChunks([{ data: '[DONE]' }])).not.toThrow();
  });
});
```

---

## 2. Integration Tests

### 2.1 OpenAI API Integration

Uses **MSW (Mock Service Worker)** to intercept HTTP requests in-process.

```ts
// tests/integration/openai-api/tool-use-workflow.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AIAgent } from '@/lib/ai/agent';
import toolCallFixture from '../../fixtures/openai-responses/tool-call-draw-rect.json';

const server = setupServer(
  http.post('https://api.openai.com/v1/chat/completions', () => {
    return HttpResponse.json(toolCallFixture);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

describe('Tool use workflow', () => {
  it('parses a draw_rectangle tool call and applies it to state', async () => {
    const agent = new AIAgent({ model: 'gpt-4o' });
    const result = await agent.send('Draw a blue rectangle');

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('draw_rectangle');
    expect(result.appliedShapes).toHaveLength(1);
    expect(result.appliedShapes[0].fill).toBe('#0000ff');
  });

  it('executes multi-turn tool calls (plan → draw → label)', async () => {
    server.use(
      http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
        const body = await request.json();
        const lastRole = body.messages.at(-1).role;
        if (lastRole === 'user') return HttpResponse.json(toolCallFixture);
        if (lastRole === 'tool') return HttpResponse.json({ /* final assistant message */ });
      }),
    );

    const agent = new AIAgent({ model: 'gpt-4o' });
    const result = await agent.send('Draw a labeled architecture diagram');
    expect(result.turns).toBeGreaterThanOrEqual(2);
  });
});
```

### 2.2 Streaming Integration

```ts
// tests/integration/openai-api/streaming.test.ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { streamChat } from '@/lib/ai/stream';
import { readFileSync } from 'fs';

const chunks = readFileSync('tests/fixtures/openai-responses/streaming-chunks.ndjson', 'utf-8');

const server = setupServer(
  http.post('https://api.openai.com/v1/chat/completions', () => {
    const stream = new ReadableStream({
      start(controller) {
        for (const line of chunks.split('\n').filter(Boolean)) {
          controller.enqueue(new TextEncoder().encode(`data: ${line}\n\n`));
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new HttpResponse(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }),
);

describe('Streaming chat', () => {
  it('emits incremental tokens and a final complete message', async () => {
    const tokens: string[] = [];
    let finalMessage = '';

    await streamChat({
      messages: [{ role: 'user', content: 'Hello' }],
      onToken: (t) => tokens.push(t),
      onComplete: (msg) => { finalMessage = msg; },
    });

    expect(tokens.length).toBeGreaterThan(1);
    expect(finalMessage).toBe(tokens.join(''));
  });
});
```

### 2.3 State Persistence

```ts
// tests/integration/state-management/persistence.test.ts
import { describe, it, expect } from 'vitest';
import { BoardStore } from '@/lib/state/board-store';
import { fakeIndexedDB } from 'fake-indexeddb';

describe('Board persistence', () => {
  it('round-trips board state through IndexedDB', async () => {
    const store = new BoardStore({ db: fakeIndexedDB });
    store.addShape({ id: 's1', type: 'rect', x: 10, y: 20, width: 100, height: 50 });
    await store.save('board-1');

    const restored = new BoardStore({ db: fakeIndexedDB });
    await restored.load('board-1');
    expect(restored.shapes).toEqual(store.shapes);
  });

  it('migrates v1 schema to v2 on load', async () => {
    // Seed a v1 document directly in IndexedDB
    const db = fakeIndexedDB;
    await seedV1Document(db, 'legacy-board');

    const store = new BoardStore({ db });
    await store.load('legacy-board');
    expect(store.version).toBe(2);
    expect(store.shapes[0]).toHaveProperty('layerId'); // v2 added layers
  });
});
```

### 2.4 Voice Pipeline

```ts
// tests/integration/voice/whisper-transcription.test.ts
import { describe, it, expect } from 'vitest';
import { transcribe } from '@/lib/voice/transcribe';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.post('https://api.openai.com/v1/audio/transcriptions', () => {
    return HttpResponse.json({ text: 'Draw a red circle' });
  }),
);

describe('Whisper transcription', () => {
  it('converts audio blob to text', async () => {
    const audioBlob = new Blob([new ArrayBuffer(1024)], { type: 'audio/webm' });
    const result = await transcribe(audioBlob);
    expect(result.text).toBe('Draw a red circle');
  });
});
```

---

## 3. End-to-End Tests

Built with **Playwright**. All tests run against a local dev server with MSW intercepting external APIs.

### 3.1 Text Mode Flow

```ts
// tests/e2e/text-mode.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Text mode', () => {
  test('user types a prompt and AI draws shapes on canvas', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /prompt/i }).fill('Draw a flowchart with 3 boxes');
    await page.getByRole('button', { name: /send/i }).click();

    // Wait for streaming to complete
    await expect(page.getByTestId('ai-status')).toHaveText('Done', { timeout: 15_000 });

    // Verify shapes appeared on canvas
    const shapes = await page.evaluate(() => window.__boardStore.shapes);
    expect(shapes.length).toBeGreaterThanOrEqual(3);
    expect(shapes.filter(s => s.type === 'rect').length).toBeGreaterThanOrEqual(3);
  });

  test('conversation history is preserved across turns', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /prompt/i }).fill('Draw a circle');
    await page.getByRole('button', { name: /send/i }).click();
    await expect(page.getByTestId('ai-status')).toHaveText('Done', { timeout: 15_000 });

    await page.getByRole('textbox', { name: /prompt/i }).fill('Now make it red');
    await page.getByRole('button', { name: /send/i }).click();
    await expect(page.getByTestId('ai-status')).toHaveText('Done', { timeout: 15_000 });

    const messages = page.getByTestId('chat-message');
    await expect(messages).toHaveCount(4); // 2 user + 2 assistant
  });
});
```

### 3.2 Voice Mode Flow

```ts
// tests/e2e/voice-mode.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Voice mode', () => {
  test.use({
    permissions: ['microphone'],
  });

  test('activates microphone, transcribes, and triggers AI response', async ({ page }) => {
    // Inject mock MediaStream
    await page.addInitScript(() => {
      const fakeStream = new MediaStream();
      navigator.mediaDevices.getUserMedia = async () => fakeStream;
    });

    await page.goto('/');
    await page.getByRole('button', { name: /voice/i }).click();
    await expect(page.getByTestId('recording-indicator')).toBeVisible();

    // Simulate end of speech
    await page.getByRole('button', { name: /stop/i }).click();
    await expect(page.getByTestId('transcription')).not.toBeEmpty();
    await expect(page.getByTestId('ai-status')).toHaveText('Done', { timeout: 15_000 });
  });
});
```

### 3.3 Drawing Generation

```ts
// tests/e2e/drawing-generation.spec.ts
import { test, expect } from '@playwright/test';

test.describe('AI drawing generation', () => {
  test('generates a diagram and all shapes are within canvas bounds', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /prompt/i }).fill(
      'Create a system architecture diagram with a frontend, API gateway, and database'
    );
    await page.getByRole('button', { name: /send/i }).click();
    await expect(page.getByTestId('ai-status')).toHaveText('Done', { timeout: 20_000 });

    const canvasRect = await page.locator('canvas').boundingBox();
    const shapes = await page.evaluate(() => window.__boardStore.shapes);

    for (const shape of shapes) {
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.y).toBeGreaterThanOrEqual(0);
      expect(shape.x + (shape.width ?? 0)).toBeLessThanOrEqual(canvasRect!.width);
    }
  });

  test('undo removes the last AI-generated batch', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /prompt/i }).fill('Draw 5 circles');
    await page.getByRole('button', { name: /send/i }).click();
    await expect(page.getByTestId('ai-status')).toHaveText('Done', { timeout: 15_000 });

    const before = await page.evaluate(() => window.__boardStore.shapes.length);
    await page.keyboard.press('Control+z');
    const after = await page.evaluate(() => window.__boardStore.shapes.length);
    expect(after).toBeLessThan(before);
  });
});
```

### 3.4 Error Recovery

```ts
// tests/e2e/error-recovery.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Error recovery', () => {
  test('shows error toast on API failure and allows retry', async ({ page }) => {
    // Intercept and fail the API call
    await page.route('**/v1/chat/completions', (route) =>
      route.fulfill({ status: 429, body: JSON.stringify({ error: { message: 'Rate limited' } }) })
    );

    await page.goto('/');
    await page.getByRole('textbox', { name: /prompt/i }).fill('Draw something');
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.getByRole('alert')).toContainText(/rate limit/i);
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  test('preserves canvas state after page reload', async ({ page }) => {
    await page.goto('/');
    // Add shape via UI
    await page.getByRole('textbox', { name: /prompt/i }).fill('Draw a square');
    await page.getByRole('button', { name: /send/i }).click();
    await expect(page.getByTestId('ai-status')).toHaveText('Done', { timeout: 15_000 });

    const beforeReload = await page.evaluate(() => window.__boardStore.shapes.length);
    await page.reload();
    await page.waitForLoadState('networkidle');
    const afterReload = await page.evaluate(() => window.__boardStore.shapes.length);

    expect(afterReload).toBe(beforeReload);
  });
});
```

---

## 4. Visual Regression Tests

Using **Playwright** with `toHaveScreenshot()` for pixel-level comparison.

```ts
// tests/visual-regression/canvas-shapes.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Canvas shape rendering', () => {
  test('rectangle renders with correct fill and border', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.__boardStore.addShape({
        type: 'rect', x: 50, y: 50, width: 200, height: 100,
        fill: '#3b82f6', stroke: '#1e40af', strokeWidth: 2, borderRadius: 8,
      });
    });
    await expect(page.locator('canvas')).toHaveScreenshot('rect-blue-rounded.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('arrow renders with correct head angle', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.__boardStore.addShape({
        type: 'arrow', x1: 50, y1: 100, x2: 250, y2: 100,
        stroke: '#000', strokeWidth: 2, headLength: 12,
      });
    });
    await expect(page.locator('canvas')).toHaveScreenshot('arrow-horizontal.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});

// tests/visual-regression/dark-mode.spec.ts
test.describe('Dark mode', () => {
  test('toolbar and canvas background switch correctly', async ({ page }) => {
    await page.goto('/');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page).toHaveScreenshot('dark-mode-empty-board.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});

// tests/visual-regression/responsive-layout.spec.ts
test.describe('Responsive layout', () => {
  for (const viewport of [
    { width: 375, height: 667, name: 'mobile' },
    { width: 768, height: 1024, name: 'tablet' },
    { width: 1440, height: 900, name: 'desktop' },
  ]) {
    test(`renders correctly at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page).toHaveScreenshot(`layout-${viewport.name}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
```

**Snapshot update workflow:**
```bash
# Generate new baselines after intentional UI changes
npx playwright test tests/visual-regression --update-snapshots
```

---

## 5. Performance Tests

Using **Vitest bench** for micro-benchmarks and **Playwright** for runtime metrics.

### 5.1 Canvas Rendering Benchmarks

```ts
// tests/performance/canvas-rendering.bench.ts
import { bench, describe } from 'vitest';
import { renderScene } from '@/lib/canvas/renderer';
import { createMockContext } from '../mocks/canvas-context';
import complexDiagram from '../fixtures/canvas-states/complex-diagram.json';
import largeDocument from '../fixtures/canvas-states/10k-shapes.json';

describe('Canvas rendering', () => {
  bench('render 50 shapes', () => {
    const ctx = createMockContext();
    renderScene(ctx, complexDiagram.shapes);
  });

  bench('render 10,000 shapes', () => {
    const ctx = createMockContext();
    renderScene(ctx, largeDocument.shapes);
  }, { time: 5000 });

  bench('hit-test in 10k shape scene', () => {
    const point = { x: 500, y: 500 };
    // Should use spatial index (R-tree) for O(log n)
    hitTest(point, largeDocument.shapes);
  });
});
```

### 5.2 Streaming Efficiency (E2E)

```ts
// tests/performance/streaming-efficiency.bench.ts
import { test, expect } from '@playwright/test';

test('streaming renders tokens with <50ms jank budget', async ({ page }) => {
  await page.goto('/');

  // Start performance tracing
  await page.tracing.start({ screenshots: false, categories: ['devtools.timeline'] });

  await page.getByRole('textbox', { name: /prompt/i }).fill('Write a paragraph');
  await page.getByRole('button', { name: /send/i }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('Done', { timeout: 15_000 });

  const trace = await page.tracing.stop();

  // Parse long tasks from trace
  const longTasks = parseLongTasks(trace);
  const maxTaskDuration = Math.max(...longTasks.map(t => t.duration));
  expect(maxTaskDuration).toBeLessThan(50); // No task blocks main thread >50ms
});
```

### 5.3 API Latency

```ts
// tests/performance/api-latency.bench.ts
import { test, expect } from '@playwright/test';

test('measures time-to-first-token (TTFT)', async ({ page }) => {
  await page.goto('/');

  const ttft = await page.evaluate(async () => {
    const start = performance.now();
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }], stream: true }),
    });
    const reader = response.body!.getReader();
    await reader.read(); // First chunk
    return performance.now() - start;
  });

  expect(ttft).toBeLessThan(2000); // TTFT < 2s
});
```

### Performance Budgets

| Metric | Target | Measurement Method |
|---|---|---|
| Canvas render (50 shapes) | < 16ms (60fps) | Vitest bench |
| Canvas render (10k shapes) | < 100ms | Vitest bench |
| Hit-test (10k shapes) | < 1ms | Vitest bench |
| Time to first token (TTFT) | < 2s | Playwright evaluation |
| Streaming jank (longest task) | < 50ms | Playwright tracing |
| Initial page load (LCP) | < 2.5s | Lighthouse CI |
| Memory after 1hr session | < 500MB heap | Playwright CDP |
| Bundle size (gzipped) | < 200KB JS | Build output check |

---

## 6. Type Tests

Using `tsd` or `vitest` with `expectTypeOf` for compile-time type validation.

```ts
// tests/types/canvas-types.test-d.ts
import { expectTypeOf, describe, it } from 'vitest';
import type { Shape, RectShape, EllipseShape, ArrowShape } from '@/types/canvas';
import type { Tool, DrawTool, SelectTool } from '@/types/tools';

describe('Shape type hierarchy', () => {
  it('Shape is a discriminated union on `type`', () => {
    expectTypeOf<Shape>().toMatchTypeOf<{ type: string; id: string }>();
  });

  it('RectShape requires width and height', () => {
    expectTypeOf<RectShape>().toHaveProperty('width');
    expectTypeOf<RectShape>().toHaveProperty('height');
    expectTypeOf<RectShape['width']>().toBeNumber();
  });

  it('narrowing Shape by type field yields correct subtype', () => {
    const shape = {} as Shape;
    if (shape.type === 'rect') {
      expectTypeOf(shape).toEqualTypeOf<RectShape>();
    }
    if (shape.type === 'ellipse') {
      expectTypeOf(shape).toEqualTypeOf<EllipseShape>();
    }
  });
});

// tests/types/api-types.test-d.ts
import { expectTypeOf, describe, it } from 'vitest';
import type { ChatCompletionRequest, ChatCompletionResponse, ToolDefinition } from '@/types/openai';

describe('OpenAI API types', () => {
  it('ChatCompletionRequest requires messages array', () => {
    expectTypeOf<ChatCompletionRequest>().toHaveProperty('messages');
    expectTypeOf<ChatCompletionRequest['model']>().toBeString();
  });

  it('ToolDefinition enforces JSON Schema structure for parameters', () => {
    expectTypeOf<ToolDefinition>().toHaveProperty('function');
    expectTypeOf<ToolDefinition['function']['parameters']>().toMatchTypeOf<{
      type: 'object';
      properties: Record<string, unknown>;
    }>();
  });

  it('streaming response uses delta instead of message', () => {
    type StreamChoice = ChatCompletionResponse<{ stream: true }>['choices'][number];
    expectTypeOf<StreamChoice>().toHaveProperty('delta');
    expectTypeOf<StreamChoice>().not.toHaveProperty('message');
  });
});

// tests/types/store-types.test-d.ts
import { expectTypeOf, describe, it } from 'vitest';
import { useBoardStore } from '@/stores/board';

describe('Store type inference', () => {
  it('addShape accepts only valid Shape objects', () => {
    const store = useBoardStore.getState();
    expectTypeOf(store.addShape).parameter(0).toMatchTypeOf<Shape>();
    // @ts-expect-error — missing required fields
    store.addShape({ type: 'rect' });
  });

  it('selector returns correct slice type', () => {
    const shapes = useBoardStore((s) => s.shapes);
    expectTypeOf(shapes).toEqualTypeOf<Shape[]>();
  });
});
```

---

## 7. Test Coverage Goals

### Coverage Targets by Module

| Module | Line Coverage | Branch Coverage | Function Coverage | Rationale |
|---|---|---|---|---|
| `lib/canvas/algorithms` | ≥ 95% | ≥ 90% | 100% | Core rendering correctness |
| `lib/canvas/shapes` | ≥ 90% | ≥ 85% | 100% | Visual output depends on this |
| `lib/ai/` | ≥ 85% | ≥ 80% | ≥ 90% | API integration is critical path |
| `lib/state/` | ≥ 90% | ≥ 85% | 100% | Data integrity |
| `lib/voice/` | ≥ 75% | ≥ 70% | ≥ 80% | Hardware-dependent paths hard to cover |
| `lib/text/` | ≥ 90% | ≥ 85% | 100% | Layout correctness |
| `components/` | ≥ 70% | ≥ 65% | ≥ 75% | UI layer, covered more by E2E |
| **Overall** | **≥ 80%** | **≥ 75%** | **≥ 85%** | |

### Critical Paths (Must be 100% covered)

1. **User prompt → API call → tool call → shape rendered on canvas** (the core loop)
2. **Undo/Redo stack** — data loss prevention
3. **Streaming token assembly** — incorrect parsing breaks the UI
4. **Board serialization/deserialization** — data corruption prevention
5. **Error boundary rendering** — user must always see actionable error state

### Coverage Enforcement

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      include: ['src/lib/**', 'src/components/**', 'src/stores/**'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test-d.ts',
        'src/**/*.stories.ts',
        'src/types/**',
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 85,
        statements: 80,
      },
      // Per-module thresholds
      perFile: true,
      watermarks: {
        lines: [70, 90],
        branches: [65, 85],
      },
    },
  },
});
```

---

## 8. Testing Tools & Infrastructure

### Core Test Runners

| Tool | Purpose | Config |
|---|---|---|
| **Vitest** | Unit + integration tests, benchmarks | `vitest.config.ts` |
| **Playwright** | E2E, visual regression, performance tracing | `playwright.config.ts` |
| **tsd / vitest `expectTypeOf`** | Compile-time type tests | Part of vitest config |

### Mocking & Fixtures

| Tool | Purpose |
|---|---|
| **MSW (Mock Service Worker)** | HTTP/WebSocket API mocking at network level |
| **fake-indexeddb** | In-memory IndexedDB for persistence tests |
| **@vitest/canvas-mock** or **jest-canvas-mock** | `CanvasRenderingContext2D` stub |
| **Recorded fixtures** (`.json`, `.ndjson`) | Deterministic API response replay |

### Canvas-Specific Testing

| Tool | Purpose |
|---|---|
| **OffscreenCanvas (Node)** | Headless canvas rendering in unit tests |
| **Pixelmatch** | Pixel-level image diff for canvas output |
| **Canvas snapshot serializer** | Custom Vitest serializer for canvas → PNG comparison |

### CI Tooling

| Tool | Purpose |
|---|---|
| **GitHub Actions** | CI runner |
| **Playwright Docker image** | Consistent browser environment |
| **Codecov / Coveralls** | Coverage reporting + PR checks |
| **Lighthouse CI** | Performance budgets in CI |
| **Percy / Chromatic** | Visual regression cloud service (alternative to local snapshots) |

### Recommended `package.json` Scripts

```jsonc
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:types": "vitest typecheck",
    "test:bench": "vitest bench",
    "test:e2e": "playwright test tests/e2e",
    "test:visual": "playwright test tests/visual-regression",
    "test:visual:update": "playwright test tests/visual-regression --update-snapshots",
    "test:perf": "playwright test tests/performance",
    "test:all": "npm run test:coverage && npm run test:types && npm run test:e2e && npm run test:visual"
  }
}
```

---

## 9. CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  unit-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test:coverage
      - run: npm run test:types
      - uses: codecov/codecov-action@v4
        with:
          files: coverage/lcov.info
          fail_ci_if_error: true

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:visual
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-diff-report
          path: test-results/

  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test:bench -- --reporter=json > bench-results.json
      - uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: customSmallerIsBetter
          output-file-path: bench-results.json
          alert-threshold: '120%'
          fail-on-alert: true
```

### PR Gating Rules

| Check | Blocks Merge? | Threshold |
|---|---|---|
| Unit + integration tests pass | ✅ Yes | 100% pass |
| Coverage thresholds met | ✅ Yes | See §7 |
| Type checks pass | ✅ Yes | Zero errors |
| E2E tests pass | ✅ Yes | 100% pass |
| Visual regression | ⚠️ Warning | 0.02 diff ratio |
| Performance regression | ⚠️ Warning | <120% of baseline |
| Bundle size | ⚠️ Warning | <200KB gzipped |

---

## Summary

| Layer | Count (est.) | Runner | Parallelizable |
|---|---|---|---|
| Unit tests | ~120 tests | Vitest | ✅ Fully |
| Integration tests | ~40 tests | Vitest + MSW | ✅ Fully |
| E2E tests | ~20 scenarios | Playwright | ✅ Per-worker |
| Visual regression | ~15 snapshots | Playwright | ✅ Per-worker |
| Performance benchmarks | ~8 benchmarks | Vitest bench + Playwright | ⚠️ Sequential |
| Type tests | ~15 assertions | Vitest typecheck | ✅ Fully |
| **Total** | **~218 tests** | | |

**Estimated CI run time:** ~4 minutes (unit/integration parallel with E2E).
