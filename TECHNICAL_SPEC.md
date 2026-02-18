# AI Whiteboard — Frontend Technical Specification

> NextJS 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Canvas API

---

## Table of Contents

1. [Component Hierarchy](#1-component-hierarchy)
2. [Whiteboard Rendering Strategy](#2-whiteboard-rendering-strategy)
3. [Animation & Latency Masking](#3-animation--latency-masking)
4. [Design System](#4-design-system)
5. [Type Safety](#5-type-safety)

---

## 1. Component Hierarchy

### 1.1 Top-Level Layout

```
<RootLayout>                          ← app/layout.tsx, full viewport, overflow-hidden
├── <WhiteboardProvider>              ← React Context: canvas state, history, active tool
│   ├── <Toolbar />                   ← floating top-center, tool selection + undo/redo
│   ├── <WhiteboardCanvas />          ← main drawing surface (see §2)
│   │   ├── <CanvasLayerStack />      ← stacked <canvas> elements via absolute positioning
│   │   │   ├── <BackgroundLayer />   ← grid/dots, static, rarely redrawn
│   │   │   ├── <ContentLayer />      ← committed shapes/paths, redrawn on mutation
│   │   │   ├── <ActiveDrawLayer />   ← in-progress stroke/shape, redrawn at 60fps
│   │   │   └── <CursorLayer />       ← remote cursors + selection handles
│   │   └── <TextOverlay />           ← DOM-based text nodes positioned over canvas
│   ├── <ChatPanel />                 ← slide-over right panel
│   │   ├── <ChatHeader />            ← title, collapse button
│   │   ├── <MessageList />           ← virtualized (react-window), auto-scroll
│   │   │   └── <Message />           ← user vs AI bubble, markdown rendering
│   │   └── <ChatInput />            ← textarea + send, supports ⌘+Enter
│   └── <PropertyPanel />            ← contextual, shown on element selection
│       ├── <FillControl />
│       ├── <StrokeControl />
│       └── <TypographyControl />
└── <Toaster />                       ← sonner for ephemeral notifications
```

### 1.2 Canvas Layer Architecture

Four stacked `<canvas>` elements share a single coordinate system. Each is absolutely positioned within a wrapper `<div>` and sized identically. This avoids full-surface redraws when only one concern changes.

| Layer | Redraws When | Z-Index |
|---|---|---|
| `BackgroundLayer` | Zoom/pan changes | 0 |
| `ContentLayer` | Shape added/modified/deleted | 1 |
| `ActiveDrawLayer` | Every pointer event (requestAnimationFrame) | 2 |
| `CursorLayer` | Remote cursor position updates | 3 |

**Why four canvases instead of one?** Isolating draw concerns means an in-progress freehand stroke (60fps on `ActiveDrawLayer`) never forces a repaint of hundreds of committed shapes on `ContentLayer`. This is the same architecture used by Excalidraw and tldraw.

### 1.3 Text Rendering Strategy

Text is rendered as **DOM nodes** (`<div contentEditable>`) absolutely positioned over the canvas stack using CSS `transform: translate(x, y) scale(zoom)`. Reasons:

- Native text selection, IME input, accessibility, spell-check
- Subpixel font rendering (canvas `fillText` is blurry on non-retina)
- Easy Tailwind typography styling

On export/rasterize, text nodes are drawn onto a temporary canvas via `ctx.fillText()` with matched font metrics.

---

## 2. Whiteboard Rendering Strategy

### 2.1 Decision: Canvas API (Primary) + DOM Overlay (Text)

| Approach | Pros | Cons |
|---|---|---|
| Pure SVG | Declarative, accessible | DOM node explosion at ~500+ elements, slow hit-testing |
| Pure Canvas | Fast rendering, single bitmap | No native text editing, manual hit-testing |
| **Canvas + DOM overlay** | Best of both: fast shapes, native text | Coordinate sync complexity |

**Chosen: Canvas + DOM overlay.** SVG is reserved only for toolbar icons and UI chrome (not the drawing surface).

### 2.2 Coordinate System & Camera

```typescript
interface Camera {
  x: number;       // pan offset X (world units)
  y: number;       // pan offset Y (world units)
  zoom: number;    // scale factor, clamped [0.1, 5.0]
}

// Screen → World transform
function screenToWorld(screenX: number, screenY: number, camera: Camera): Point {
  return {
    x: (screenX - camera.x) / camera.zoom,
    y: (screenY - camera.y) / camera.zoom,
  };
}
```

Pan via middle-click drag or two-finger trackpad. Zoom toward cursor via `wheel` event with `ctrl` detection.

### 2.3 Rendering Pipeline

```
                    ┌─────────────┐
  AI spec arrives → │ Spec Parser │ → normalize into DrawElement[]
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Scene Graph  │ ← spatial index (R-tree via rbush)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        Background    Content      Active/Cursor
         Canvas       Canvas        Canvas
```

- **Spatial index**: `rbush` R-tree for O(log n) viewport culling and hit-testing.
- **Dirty rect tracking**: Only repaint the bounding box of changed elements on `ContentLayer`.
- **Off-screen canvas**: Pre-render complex elements (e.g., dense freehand paths) to `OffscreenCanvas`, blit on pan/zoom.

### 2.4 Handling Realtime AI Drawing Specs

The AI returns a stream of drawing instructions (JSON chunks over SSE or WebSocket):

```jsonc
// Example streamed spec
{ "op": "add", "element": { "type": "rect", "x": 100, "y": 50, "w": 200, "h": 120, "fill": "#F5F5F7", "stroke": "#1D1D1F", "strokeWidth": 1.5, "cornerRadius": 12 } }
{ "op": "add", "element": { "type": "text", "x": 110, "y": 70, "content": "User Auth Flow", "fontSize": 18, "fontFamily": "SF Pro Display", "fill": "#1D1D1F" } }
{ "op": "add", "element": { "type": "arrow", "from": "elem_1", "to": "elem_2", "stroke": "#86868B" } }
```

**Ingestion pipeline:**

1. **SSE stream** parsed via `EventSource` or `fetch` + `ReadableStream`.
2. Each chunk is validated against Zod schemas (see §5).
3. Valid elements are appended to the scene graph and rendered immediately.
4. Batch commits: buffer 16ms of ops, flush on next `requestAnimationFrame`.

---

## 3. Animation & Latency Masking

### 3.1 Progressive Rendering

Elements are revealed as they arrive from the AI stream. Each element animates in:

```css
@keyframes elementReveal {
  0%   { opacity: 0; transform: scale(0.96) translateY(4px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
```

Duration: `200ms`, easing: `cubic-bezier(0.16, 1, 0.3, 1)` (Apple ease-out).

For canvas-drawn elements, animate opacity from 0→1 over ~12 frames via `globalAlpha` interpolation inside `requestAnimationFrame`.

### 3.2 Skeleton / Placeholder States

While waiting for the first AI element:

1. **Pulsing dot indicator** — three dots in the chat panel ("AI is drawing…").
2. **Ghost bounding boxes** — if the AI returns a layout hint before full specs, render dashed-outline placeholders at predicted positions:

```typescript
function drawGhostRect(ctx: CanvasRenderingContext2D, rect: BoundingBox) {
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(0, 122, 255, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([]);
}
```

3. **Shimmer overlay** — a subtle CSS gradient animation on the canvas wrapper, removed when first element renders.

### 3.3 Optimistic Camera

When a user sends a prompt like "draw a flowchart", immediately:
- Zoom to fit a predicted bounding box (e.g., center 800×600 region)
- Smooth-animate camera via `lerp` over 400ms
- Readjust once actual bounding box is known

```typescript
function lerpCamera(from: Camera, to: Camera, t: number): Camera {
  const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
  return {
    x: from.x + (to.x - from.x) * ease,
    y: from.y + (to.y - from.y) * ease,
    zoom: from.zoom + (to.zoom - from.zoom) * ease,
  };
}
```

### 3.4 Debounced Input → Streaming Response

```
User types → 150ms debounce → POST /api/draw (streaming)
                                    │
                 ┌──────────────────┤ first chunk: ~300ms
                 ▼                  │
          render first element      │ subsequent chunks: ~50ms each
                                    ▼
                              render remaining
```

Total perceived latency: **~450ms** to first visible element. The gap is filled by the skeleton states above.

---

## 4. Design System

### 4.1 Philosophy

Inspired by Apple's design language — *reduction to essence*. Every pixel must earn its place.

Principles:
- **Clarity**: content is the interface, chrome disappears
- **Deference**: UI recedes, whiteboard content dominates
- **Depth**: subtle shadows and layering create hierarchy without borders

### 4.2 Color Palette

```typescript
const colors = {
  // Neutrals (Apple's system grays)
  background:    '#FFFFFF',
  surface:       '#F5F5F7',     // panels, cards
  surfaceHover:  '#E8E8ED',
  border:        '#D2D2D7',
  textPrimary:   '#1D1D1F',
  textSecondary: '#86868B',
  textTertiary:  '#AEAEB2',

  // Accents
  blue:          '#007AFF',     // primary action, selection handles
  blueHover:     '#0066D6',
  green:         '#34C759',     // success
  red:           '#FF3B30',     // destructive
  orange:        '#FF9500',     // warning

  // Canvas
  canvasBg:      '#FAFAFA',
  gridDot:       '#E5E5EA',
  selection:     'rgba(0, 122, 255, 0.08)',
  selectionBorder: '#007AFF',
} as const;
```

**Dark mode**: invert neutrals, keep accent hues, reduce saturation by 10%. Use `prefers-color-scheme` media query + Tailwind `dark:` variant.

### 4.3 Typography

```css
/* tailwind.config.ts → theme.extend.fontFamily */
fontFamily: {
  sans:    ['SF Pro Display', 'Inter', 'system-ui', 'sans-serif'],
  mono:    ['SF Mono', 'JetBrains Mono', 'monospace'],
}
```

| Use Case | Font | Size | Weight | Tracking |
|---|---|---|---|---|
| Page title | SF Pro Display | 28px / 1.75rem | 600 | -0.02em |
| Section heading | SF Pro Display | 20px / 1.25rem | 600 | -0.01em |
| Body | SF Pro Display | 15px / 0.9375rem | 400 | 0 |
| Caption / label | SF Pro Display | 13px / 0.8125rem | 500 | 0.01em |
| Code / coords | SF Mono | 13px / 0.8125rem | 400 | 0 |

### 4.4 Spacing & Layout

8px base grid. All spacing is a multiple of 4px:

```typescript
// tailwind.config.ts → theme.extend.spacing (supplements defaults)
spacing: {
  '4.5': '1.125rem',  // 18px — common padding
  '13':  '3.25rem',   // 52px — toolbar height
  '15':  '3.75rem',   // 60px — panel header
}
```

- **Chat panel width**: `384px` (w-96), collapsible to `0` with `transform: translateX(100%)`.
- **Toolbar height**: `52px`, floating with `backdrop-blur-xl bg-white/80` (vibrancy effect).
- **Border radius**: `12px` for panels, `8px` for buttons, `6px` for inputs.
- **Shadows**: use `shadow-sm` for resting state, `shadow-md` on hover, `shadow-lg` for modals. Never use hard borders between major sections — rely on background color contrast + shadow.

### 4.5 Motion

```typescript
const motion = {
  duration: {
    fast:    '120ms',   // hover states, micro-interactions
    normal:  '200ms',   // panel transitions, element reveals
    slow:    '400ms',   // camera moves, layout shifts
  },
  easing: {
    default: 'cubic-bezier(0.16, 1, 0.3, 1)',    // Apple ease-out
    spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)', // overshoot
    linear:  'linear',
  },
} as const;
```

Tailwind utility: `transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]`.

---

## 5. Type Safety

### 5.1 Drawing Primitives

```typescript
// ─── Geometry ─────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Style ────────────────────────────────────────────────

type HexColor = `#${string}`;

interface FillStyle {
  type: 'solid' | 'none';
  color: HexColor;
  opacity: number;            // 0–1
}

interface StrokeStyle {
  color: HexColor;
  width: number;              // px
  dashArray?: number[];       // e.g. [6, 4] for dashed
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
}

interface TextStyle {
  fontFamily: string;
  fontSize: number;           // px
  fontWeight: 400 | 500 | 600 | 700;
  lineHeight: number;         // multiplier, e.g. 1.4
  letterSpacing: number;      // em
  color: HexColor;
  align: 'left' | 'center' | 'right';
}

// ─── Elements ─────────────────────────────────────────────

interface BaseElement {
  id: string;                 // nanoid, 21 chars
  type: string;
  x: number;
  y: number;
  rotation: number;           // degrees
  opacity: number;            // 0–1
  locked: boolean;
  groupId?: string;
  createdAt: number;          // unix ms
  updatedAt: number;
}

interface RectElement extends BaseElement {
  type: 'rect';
  w: number;
  h: number;
  cornerRadius: number;
  fill: FillStyle;
  stroke: StrokeStyle;
}

interface EllipseElement extends BaseElement {
  type: 'ellipse';
  rx: number;                 // radius X
  ry: number;                 // radius Y
  fill: FillStyle;
  stroke: StrokeStyle;
}

interface LineElement extends BaseElement {
  type: 'line';
  points: Point[];            // polyline defined by 2+ points
  stroke: StrokeStyle;
}

interface ArrowElement extends BaseElement {
  type: 'arrow';
  points: Point[];
  stroke: StrokeStyle;
  startArrowhead: 'none' | 'arrow' | 'dot';
  endArrowhead: 'none' | 'arrow' | 'dot';
  startBindingId?: string;    // attached element id
  endBindingId?: string;
}

interface FreehandElement extends BaseElement {
  type: 'freehand';
  points: Point[];
  pressures?: number[];       // per-point pressure for variable width
  stroke: StrokeStyle;
}

interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  w: number;                  // auto-sized or manually set
  h: number;
  style: TextStyle;
}

interface ImageElement extends BaseElement {
  type: 'image';
  src: string;                // blob URL or remote URL
  w: number;
  h: number;
  naturalWidth: number;
  naturalHeight: number;
}

type DrawElement =
  | RectElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | FreehandElement
  | TextElement
  | ImageElement;

// ─── Scene / State ────────────────────────────────────────

interface Scene {
  elements: Map<string, DrawElement>;
  selectedIds: Set<string>;
  camera: Camera;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

// ─── AI Protocol ──────────────────────────────────────────

type DrawOp =
  | { op: 'add';    element: DrawElement }
  | { op: 'update'; id: string; patch: Partial<DrawElement> }
  | { op: 'delete'; id: string }
  | { op: 'clear' };

interface AIDrawResponse {
  requestId: string;
  ops: DrawOp[];              // full response (non-streaming)
}

// For streaming, each SSE `data:` line is a single DrawOp.

// ─── History (Undo/Redo) ─────────────────────────────────

interface HistoryEntry {
  timestamp: number;
  ops: DrawOp[];               // forward ops
  inverseOps: DrawOp[];        // ops to undo this entry
}

interface HistoryStack {
  entries: HistoryEntry[];
  pointer: number;             // current position, -1 = empty
}
```

### 5.2 Zod Schemas (Runtime Validation)

Every `DrawOp` arriving from the AI stream is validated at the boundary:

```typescript
import { z } from 'zod';

const PointSchema = z.object({ x: z.number(), y: z.number() });

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);

const FillStyleSchema = z.object({
  type: z.enum(['solid', 'none']),
  color: HexColorSchema,
  opacity: z.number().min(0).max(1),
});

const StrokeStyleSchema = z.object({
  color: HexColorSchema,
  width: z.number().positive(),
  dashArray: z.array(z.number()).optional(),
  lineCap: z.enum(['butt', 'round', 'square']),
  lineJoin: z.enum(['miter', 'round', 'bevel']),
});

const RectElementSchema = z.object({
  type: z.literal('rect'),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  cornerRadius: z.number().min(0),
  fill: FillStyleSchema,
  stroke: StrokeStyleSchema,
});

// ... additional element schemas follow the same pattern

const DrawOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'),    element: RectElementSchema /* | union */ }),
  z.object({ op: z.literal('update'), id: z.string(), patch: z.record(z.unknown()) }),
  z.object({ op: z.literal('delete'), id: z.string() }),
  z.object({ op: z.literal('clear') }),
]);
```

### 5.3 Suggested File Organization

```
src/
├── app/
│   ├── layout.tsx                 # root layout, providers
│   ├── page.tsx                   # main whiteboard page
│   └── api/
│       └── draw/
│           └── route.ts           # streaming AI endpoint
├── components/
│   ├── whiteboard/
│   │   ├── WhiteboardCanvas.tsx   # canvas stack wrapper
│   │   ├── BackgroundLayer.tsx
│   │   ├── ContentLayer.tsx
│   │   ├── ActiveDrawLayer.tsx
│   │   ├── CursorLayer.tsx
│   │   ├── TextOverlay.tsx
│   │   └── Toolbar.tsx
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── MessageList.tsx
│   │   ├── Message.tsx
│   │   └── ChatInput.tsx
│   └── ui/                        # shadcn/ui primitives
│       ├── button.tsx
│       ├── input.tsx
│       └── tooltip.tsx
├── hooks/
│   ├── useCanvas.ts               # 2D context setup, DPR scaling
│   ├── useCamera.ts               # pan/zoom logic
│   ├── useHistory.ts              # undo/redo stack
│   └── useAIStream.ts            # SSE consumer, Zod validation
├── lib/
│   ├── renderer.ts                # element → canvas draw calls
│   ├── hit-test.ts                # point-in-shape, R-tree queries
│   ├── spatial-index.ts           # rbush wrapper
│   └── schema.ts                  # Zod schemas
├── types/
│   └── drawing.ts                 # all interfaces from §5.1
└── styles/
    └── globals.css                # Tailwind directives, @font-face
```

---

## Implementation Priority

| Phase | Scope | Estimate |
|---|---|---|
| **P0** | Canvas stack + camera + rect/ellipse/text rendering | 3 days |
| **P1** | AI stream ingestion + progressive rendering + chat panel | 2 days |
| **P2** | Freehand drawing + arrows + hit-testing + selection | 3 days |
| **P3** | Undo/redo + property panel + export | 2 days |
| **P4** | Dark mode + polish + accessibility audit | 2 days |

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `next` 14.x | Framework |
| `react` 18.x | UI |
| `tailwindcss` 3.x | Styling |
| `zod` | Runtime validation of AI specs |
| `nanoid` | Element ID generation |
| `rbush` | R-tree spatial index |
| `react-window` | Virtualized chat message list |
| `sonner` | Toast notifications |
| `perfect-freehand` | Pressure-sensitive freehand stroke rendering |
