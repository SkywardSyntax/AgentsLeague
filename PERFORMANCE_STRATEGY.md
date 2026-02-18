# AI Whiteboard — Latency & Performance Strategy

> **Goal**: Keep perceived latency under **100 ms** for local interactions and under **500 ms** for AI-generated content so the whiteboard feels as responsive as a native drawing tool.

---

## 1. Latency Sources & Budgets

| Source | Typical Range | Target | Notes |
|---|---|---|---|
| **Network round-trip** | 20–150 ms | < 50 ms (P95) | Edge deployment, regional API gateways |
| **LLM API (TTFB)** | 300–2 000 ms | < 400 ms TTFB | Streaming mandatory; prompt caching where available |
| **LLM token streaming** | 30–80 ms/token | Render every chunk | Progressive spec rendering hides tail latency |
| **JSON spec parsing** | 1–10 ms | < 5 ms | Pre-validated schema, streaming JSON parser |
| **Canvas render cycle** | 1–16 ms | < 8 ms (120 fps budget) | Batch draw calls, avoid layout thrash |
| **State reconciliation** | 2–15 ms | < 5 ms | Immutable data structures, structural sharing |
| **Image/asset loading** | 50–500 ms | < 100 ms (cached) | CDN + Service Worker pre-cache |

### Critical Path Breakdown

```
User Prompt → Network → LLM TTFB → First Token → Streaming Parse → Canvas Render
                                     ▲                                    ▲
                                     │                                    │
                              TARGET: < 400 ms                    TARGET: < 8 ms/frame
                              (show first shape)                  (sustained 120 fps)
```

---

## 2. Latency Masking Techniques

### 2.1 Skeleton States

Display placeholder shapes the moment the user triggers an AI action. Replace them progressively as the real spec streams in.

```typescript
interface SkeletonConfig {
  // Show pulsing placeholder rectangles in the estimated layout region
  estimatedBounds: Rect;
  // Number of placeholder shapes to show (heuristic from prompt complexity)
  estimatedShapeCount: number;
  // Animation: subtle pulse or shimmer
  animation: 'pulse' | 'shimmer';
  // Auto-dismiss after real data arrives or timeout
  timeoutMs: number; // 5000
}

function showSkeleton(config: SkeletonConfig): SkeletonHandle {
  const placeholders = generatePlaceholderShapes(config);
  canvas.addLayer('skeleton', placeholders);
  canvas.startAnimation(config.animation);
  return {
    replace(realShapes: Shape[]) {
      canvas.crossfade('skeleton', realShapes, { durationMs: 150 });
    },
    dismiss() {
      canvas.removeLayer('skeleton', { fade: true });
    },
  };
}
```

**Latency target**: Skeleton visible within **50 ms** of user action.

### 2.2 Optimistic Rendering

For user-driven mutations (move, resize, delete, color change), apply the change to the local canvas immediately and reconcile with the server asynchronously.

```typescript
function optimisticUpdate(op: Operation): void {
  // 1. Apply locally (instant)
  const snapshot = canvas.snapshot();
  canvas.applyLocal(op);

  // 2. Send to server (async)
  api.send(op).catch(() => {
    // 3. Rollback on failure
    canvas.restore(snapshot);
    toast.error('Change failed — reverted.');
  });
}
```

**Latency target**: Local apply in **< 1 ms**; server confirm within **200 ms**.

### 2.3 Progressive Enhancement

Render shapes in three visual passes so the user sees content as fast as possible:

| Pass | What Renders | When |
|---|---|---|
| **Pass 1 — Geometry** | Solid fills, strokes, positions | Immediately on first spec chunk |
| **Pass 2 — Text** | Labels, annotations | After font loaded / text parsed |
| **Pass 3 — Effects** | Shadows, gradients, blur | requestIdleCallback or next rAF |

---

## 3. Rendering Optimization

### 3.1 Canvas Batching

Batch all draw calls within a single `requestAnimationFrame` tick. Never call `ctx.stroke()` or `ctx.fill()` inside a per-shape loop without batching.

```typescript
class RenderPipeline {
  private dirty = false;
  private pendingOps: DrawCommand[] = [];

  enqueue(cmd: DrawCommand) {
    this.pendingOps.push(cmd);
    if (!this.dirty) {
      this.dirty = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  private flush() {
    const ctx = this.canvas.getContext('2d')!;

    // Sort by z-index, then by paint type to minimize state switches
    this.pendingOps.sort(batchComparator);

    ctx.save();
    let currentStyle: string | null = null;
    for (const cmd of this.pendingOps) {
      if (cmd.fillStyle !== currentStyle) {
        if (currentStyle !== null) ctx.fill();
        ctx.beginPath();
        currentStyle = cmd.fillStyle;
        ctx.fillStyle = currentStyle;
      }
      cmd.tracePath(ctx);
    }
    if (currentStyle !== null) ctx.fill();
    ctx.restore();

    this.pendingOps.length = 0;
    this.dirty = false;
  }
}
```

### 3.2 requestAnimationFrame Scheduling

```typescript
// Prioritized frame scheduler: input handling > AI render > effects
const FRAME_BUDGET_MS = 8; // target 120 fps

function scheduledRender(tasks: PriorityQueue<RenderTask>) {
  requestAnimationFrame((timestamp) => {
    const deadline = timestamp + FRAME_BUDGET_MS;

    while (tasks.length > 0 && performance.now() < deadline) {
      const task = tasks.dequeue()!;
      task.execute();
    }

    if (tasks.length > 0) {
      scheduledRender(tasks); // continue next frame
    }
  });
}
```

### 3.3 GPU Acceleration

| Technique | When to Use |
|---|---|
| **OffscreenCanvas + WebWorker** | Heavy path computation off main thread |
| **WebGL / WebGPU backend** | > 500 shapes or complex gradients/blurs |
| **CSS `will-change: transform`** | UI overlay elements (toolbar, cursors) |
| **`canvas.transferToImageBitmap()`** | Snapshot static layers, composite cheaply |

Layer architecture:

```
┌──────────────────────────────┐
│  UI Overlay (DOM/CSS)        │  ← cursor, selection handles, menus
├──────────────────────────────┤
│  Active Layer (Canvas 2D)    │  ← shapes being drawn/edited NOW
├──────────────────────────────┤
│  Cached Layer (ImageBitmap)  │  ← static shapes, rasterized once
├──────────────────────────────┤
│  Background (CSS)            │  ← grid, paper texture
└──────────────────────────────┘
```

---

## 4. Streaming Efficiency

### 4.1 Partial Spec Rendering

Use a **streaming JSON parser** (e.g., `@streamparser/json` or custom SAX-style) to emit renderable shapes before the full response arrives.

```typescript
import { JSONParser } from '@streamparser/json';

async function streamSpec(response: ReadableStream<Uint8Array>) {
  const parser = new JSONParser({ paths: ['$.shapes.*'] });

  parser.onValue = ({ value, key, stack }) => {
    if (isCompleteShape(value)) {
      renderPipeline.enqueue(shapeToDrawCommand(value as ShapeSpec));
    }
  };

  const reader = response.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.write(decoder.decode(value, { stream: true }));
  }
}
```

**Latency target**: First shape rendered within **1 token** of its JSON object closing.

### 4.2 Incremental Updates (Diffing)

For follow-up prompts ("make the box bigger", "change color to red"), send a **diff** not a full spec:

```jsonc
// Instead of re-sending the full spec:
{
  "type": "patch",
  "ops": [
    { "op": "replace", "path": "/shapes/3/width", "value": 200 },
    { "op": "replace", "path": "/shapes/3/fill", "value": "#ff0000" }
  ]
}
```

Instruct the LLM (via system prompt) to emit JSON Patch operations when `previous_spec_hash` is provided.

### 4.3 Chunking Strategy

| Chunk Size | Use Case |
|---|---|
| **Per-shape** (preferred) | Streaming render — each shape is independently renderable |
| **Per-group** | Grouped/connected shapes (e.g., flowchart node + label) |
| **Full spec** | Only for tiny specs (< 1 KB) or validation passes |

Server-Sent Events framing:

```
event: shape
data: {"id":"s1","type":"rect","x":10,"y":20,"w":100,"h":60,"fill":"#4A90D9"}

event: shape
data: {"id":"s2","type":"text","x":30,"y":45,"content":"Start","font":"14px Inter"}

event: done
data: {"shapeCount":2,"hash":"abc123"}
```

---

## 5. Caching Strategy

### 5.1 Shape Memoization

```typescript
// Memoize expensive path computations keyed by shape spec hash
const pathCache = new LRUCache<string, Path2D>({ max: 2000 });

function getPath(shape: ShapeSpec): Path2D {
  const key = shapeHash(shape);
  let path = pathCache.get(key);
  if (!path) {
    path = buildPath2D(shape);
    pathCache.set(key, path);
  }
  return path;
}
```

### 5.2 Computed Drawing Commands

Pre-compile shape specs into flat drawing command arrays that bypass object traversal at render time:

```typescript
type CompiledDrawCommand = Float64Array;
// Layout: [opcode, ...params, opcode, ...params, ...]
// Opcodes: MOVE=1, LINE=2, ARC=3, FILL=4, STROKE=5, ...

function compile(shape: ShapeSpec): CompiledDrawCommand {
  const buffer: number[] = [];
  // ... emit typed numeric opcodes
  return new Float64Array(buffer);
}
```

### 5.3 LLM Prompt Caching

Use **prompt caching** (supported by Anthropic's Claude, OpenAI's GPT-4+) to avoid re-processing the static system prompt and schema definition on every call.

```typescript
const cachedSystemPrompt = {
  role: 'system',
  content: WHITEBOARD_SYSTEM_PROMPT, // ~2000 tokens of schema + rules
  cache_control: { type: 'ephemeral' }, // Anthropic-style cache hint
};

async function generateSpec(userPrompt: string) {
  return llm.stream({
    messages: [cachedSystemPrompt, { role: 'user', content: userPrompt }],
    stream: true,
  });
}
```

**Savings**: 1 500–2 000 input tokens cached → ~80% cost reduction and ~200 ms TTFB reduction on cache hit.

### 5.4 HTTP & Asset Caching

| Resource | Cache Strategy | TTL |
|---|---|---|
| Font files | `Cache-Control: immutable` | 1 year |
| Static textures | Service Worker + Cache API | 1 year |
| Generated specs | IndexedDB by content hash | Session-scoped |
| Thumbnail previews | Memory LRU (50 entries) | Session-scoped |

---

## 6. Metrics & Monitoring

### 6.1 Core Metrics

| Metric | Definition | Target | Collection Method |
|---|---|---|---|
| **TTFB (AI)** | User submit → first byte from LLM | < 400 ms P95 | `performance.mark` around fetch |
| **TTFS (Time to First Shape)** | User submit → first shape painted on canvas | < 600 ms P95 | Custom PerformanceObserver |
| **Render FPS** | Frames per second during active rendering | ≥ 60 fps sustained | `requestAnimationFrame` delta tracking |
| **Frame budget utilization** | % of 16.6 ms frame used by JS | < 50% idle | `PerformanceLongAnimationFrame` API |
| **E2E latency** | User submit → full spec rendered | < 3 s P95 | Start/end marks |
| **Input latency** | Pointer event → visual feedback | < 50 ms P99 | Event timestamp vs rAF callback |
| **Jank count** | Frames exceeding 50 ms | 0 per interaction | Long Animation Frame API |
| **Cache hit rate** | Prompt cache hits / total requests | > 70% | Server-side logging |

### 6.2 Instrumentation

```typescript
const perfMonitor = {
  marks: new Map<string, number>(),

  start(label: string) {
    this.marks.set(label, performance.now());
  },

  end(label: string): number {
    const start = this.marks.get(label)!;
    const duration = performance.now() - start;
    this.marks.delete(label);

    // Report to analytics
    analytics.timing(label, duration);

    // Log if exceeding budget
    const budget = LATENCY_BUDGETS[label];
    if (budget && duration > budget) {
      console.warn(`[PERF] ${label}: ${duration.toFixed(1)}ms exceeds ${budget}ms budget`);
    }

    return duration;
  },
};

// FPS tracker
class FPSMonitor {
  private frameTimes: number[] = [];
  private lastFrame = 0;

  tick(timestamp: number) {
    if (this.lastFrame) {
      this.frameTimes.push(timestamp - this.lastFrame);
      if (this.frameTimes.length > 120) this.frameTimes.shift();
    }
    this.lastFrame = timestamp;
  }

  get fps(): number {
    if (this.frameTimes.length === 0) return 0;
    const avg = this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
    return 1000 / avg;
  }

  get droppedFrames(): number {
    return this.frameTimes.filter(t => t > 50).length;
  }
}
```

### 6.3 Alerting Thresholds

| Condition | Severity | Action |
|---|---|---|
| P95 TTFS > 800 ms | Warning | Check LLM provider latency |
| P95 TTFS > 1 500 ms | Critical | Failover to backup provider |
| Sustained FPS < 30 | Warning | Reduce shape detail level |
| Sustained FPS < 15 | Critical | Switch to simplified render mode |
| Jank > 5 frames/min | Warning | Profile main thread |

---

## 7. Optimized Spec Format

### 7.1 Compact JSON

Minimize key lengths and use arrays for coordinate data:

```jsonc
// ❌ Verbose (238 bytes)
{
  "shapes": [
    {
      "type": "rectangle",
      "position": { "x": 10, "y": 20 },
      "dimensions": { "width": 100, "height": 60 },
      "fill": { "color": "#4A90D9", "opacity": 1.0 },
      "stroke": { "color": "#2C3E50", "width": 2 }
    }
  ]
}

// ✅ Compact (94 bytes — 60% reduction)
{
  "s": [
    { "t": "r", "b": [10, 20, 100, 60], "f": "#4A90D9", "s": ["#2C3E50", 2] }
  ]
}
```

Schema mapping (included in system prompt):

```
t: type (r=rect, e=ellipse, l=line, t=text, p=path, g=group)
b: bounds [x, y, w, h]
f: fill color
s: stroke [color, width]
c: children (for groups)
x: text content
```

### 7.2 Binary Encoding (for large specs)

For specs with > 200 shapes, consider a binary format transferred via `ArrayBuffer`:

```typescript
// Binary shape record: 32 bytes fixed
// [type:u8][flags:u8][x:f32][y:f32][w:f32][h:f32][fill:u32][strokeColor:u32][strokeWidth:f32][padding:2B]

const SHAPE_BYTES = 32;

function decodeBinarySpec(buffer: ArrayBuffer): ShapeSpec[] {
  const view = new DataView(buffer);
  const count = buffer.byteLength / SHAPE_BYTES;
  const shapes: ShapeSpec[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const offset = i * SHAPE_BYTES;
    shapes[i] = {
      type: SHAPE_TYPES[view.getUint8(offset)],
      x: view.getFloat32(offset + 2, true),
      y: view.getFloat32(offset + 6, true),
      w: view.getFloat32(offset + 10, true),
      h: view.getFloat32(offset + 14, true),
      fill: uint32ToHex(view.getUint32(offset + 18, true)),
      strokeColor: uint32ToHex(view.getUint32(offset + 22, true)),
      strokeWidth: view.getFloat32(offset + 26, true),
    };
  }
  return shapes;
}
```

**Trade-off**: Binary is ~75% smaller than compact JSON for large payloads, but requires a server-side encoding step (not suitable for direct LLM output — use as a post-processing optimization for cached/stored specs).

### 7.3 Format Selection Logic

```
Spec size < 1 KB   → Full JSON (human-readable, no optimization needed)
Spec size 1–50 KB  → Compact JSON (LLM output format)
Spec size > 50 KB  → Binary encoding (server-transcoded, cached)
```

---

## 8. Network Optimization

### 8.1 Compression

| Layer | Method | Expected Savings |
|---|---|---|
| HTTP response | `Content-Encoding: br` (Brotli) | 70–85% for JSON |
| WebSocket frames | `permessage-deflate` extension | 60–75% |
| Spec storage | LZ4 (fast decompression) | 50–65% |

```typescript
// Server: enable Brotli for API responses
app.use(compression({
  filter: (req) => req.path.startsWith('/api/'),
  level: 4, // balance speed vs ratio
  encodings: ['br', 'gzip'],
}));
```

### 8.2 CDN & Edge Strategy

```
┌─────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────┐
│  Client  │────▶│  CDN Edge    │────▶│  API Gateway │────▶│  LLM    │
│          │◀────│  (Cloudflare)│◀────│  (Regional)  │◀────│  API    │
└─────────┘     └──────────────┘     └──────────────┘     └─────────┘
                  │                     │
                  │ Static assets       │ WebSocket upgrade
                  │ Cached specs        │ SSE streaming
                  │ Font files          │
```

| Resource | CDN Behavior |
|---|---|
| `/assets/*` | Cache indefinitely (content-hashed filenames) |
| `/api/spec/stream` | Pass-through (no caching, SSE) |
| `/api/spec/:hash` | Cache 24h (immutable generated specs) |
| `/fonts/*` | Cache 1 year, `immutable` |

### 8.3 Connection Optimization

```typescript
// Preconnect to LLM API endpoint on app load
const preconnect = document.createElement('link');
preconnect.rel = 'preconnect';
preconnect.href = 'https://api.llm-provider.com';
document.head.appendChild(preconnect);

// Keep-alive WebSocket with heartbeat
class WhiteboardSocket {
  private ws: WebSocket;
  private heartbeatInterval: number;

  connect(url: string) {
    this.ws = new WebSocket(url);
    this.heartbeatInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 30_000);
  }
}
```

### 8.4 Request Optimization

| Technique | Implementation |
|---|---|
| **Request coalescing** | Debounce rapid prompt edits (300 ms window) |
| **Speculative prefetch** | Pre-warm LLM connection on prompt focus |
| **Abort controller** | Cancel in-flight requests when user submits new prompt |
| **HTTP/2 multiplexing** | Single connection for all API calls |

```typescript
let activeController: AbortController | null = null;

async function submitPrompt(prompt: string) {
  // Cancel any in-flight request
  activeController?.abort();
  activeController = new AbortController();

  const response = await fetch('/api/spec/stream', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
    signal: activeController.signal,
    headers: { 'Content-Type': 'application/json' },
  });

  await streamSpec(response.body!);
}
```

---

## Summary: Latency Targets at a Glance

| Interaction | Target | Technique |
|---|---|---|
| User draws/moves shape | < 16 ms | Optimistic render, no server round-trip |
| Toolbar click → visual feedback | < 50 ms | CSS transitions, no JS |
| AI prompt → skeleton visible | < 100 ms | Skeleton placeholders |
| AI prompt → first shape painted | < 600 ms | Streaming parse + partial render |
| AI prompt → full spec rendered | < 3 s | Chunked streaming, compact format |
| Undo/redo | < 5 ms | Immutable snapshots |
| Pan/zoom | < 8 ms/frame | GPU-composited layer, cached bitmap |
| Collaborative cursor update | < 100 ms | WebSocket, no ack required |

---

## Implementation Priority

| Phase | Focus | Impact |
|---|---|---|
| **P0 — Foundation** | Streaming JSON parser, rAF batching, skeleton states | Eliminates worst-case stalls |
| **P1 — Polish** | Prompt caching, compact spec format, progressive passes | 40–60% latency reduction |
| **P2 — Scale** | Binary encoding, OffscreenCanvas, WebGL backend | Handles 1000+ shapes at 60 fps |
| **P3 — Monitoring** | Full metric pipeline, alerting, perf dashboards | Prevents regressions |
