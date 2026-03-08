# AgentsLeague

An AI-powered mathematical whiteboard built with Next.js and the OpenAI Responses API. The model streams prose explanations interleaved with structured draw batches that are animated on a 3-layer HTML5 canvas — producing handwritten-style diagrams of functions, coordinate systems, linear algebra, calculus, and statistics.

The app ships 23 first-class `DrawElement` types covering everything from rectangles and arrows to Riemann sums and normal distribution curves. A math expression parser with implicit multiplication support lets the model (or a developer) write `sin(2*PI*x) / x` and have it rendered as a smooth, animated curve. Five colour themes, PNG/SVG/clipboard export, and scene sharing via URL round out the feature set.

Draw payloads are transport-agnostic: the same `applyDrawBatch` pipeline is used whether the batch arrives from the model's SSE stream or from the direct HTTP injection endpoint, guaranteeing consistent validation, normalisation, and rendering regardless of source.

---

## Quick Start

```bash
npm install
cp .env.example .env.local   # add your OPENAI_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | **Yes** | — | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-5.2` | Model to use |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | OpenAI-compatible endpoint |
| `OPENAI_EXTRA_HEADERS_JSON` | No | `{}` | Extra headers (JSON object) attached to each model call |

---

## Architecture Overview

### Canvas: 3-Layer Rendering

| Layer | Ref | Contents | Update Strategy |
|-------|-----|----------|-----------------|
| Background | `bgRef` | Static 30 px grid | Redrawn only when dirty (`gridDirtyRef`) |
| Committed | `committedRef` | Completed strokes | Redrawn on new committed strokes (`committedDirtyRef`) |
| Active | `activeRef` | Currently animating strokes | Redrawn every animation frame |

On export the three layers are composited into a single image.

### Math Pipeline

```
DrawBatch JSON → validate (Zod) → normalise → expand primitives (lowerer)
  → compile strokes → animate on canvas
```

### Key Files

| File | Description |
|------|-------------|
| `src/components/whiteboard/WhiteboardCanvas.tsx` | 3-layer canvas renderer, zoom/pan, export refs |
| `src/lib/server/whiteboard/apply-draw-batch.ts` | Transport-agnostic batch validation & processing |
| `src/lib/whiteboard/lowerer.ts` | Semantic → Draw element expansion, expression evaluation |
| `src/lib/whiteboard/graph-script.ts` | Math expression parser, GraphScript DSL |
| `src/lib/whiteboard/canvas-export.ts` | PNG / SVG / clipboard export |
| `src/lib/whiteboard/batch-sequencer.ts` | Monotonic sequence counter for deterministic ordering |
| `src/lib/whiteboard/color-theme.ts` | 5 colour-theme definitions |
| `src/hooks/useDrawInjector.ts` | Client-side hook for the inject API |
| `src/app/api/agent/stream/route.ts` | SSE streaming endpoint (chat + draw) |
| `src/app/api/whiteboard/inject/route.ts` | Direct draw-batch injection endpoint |

---

## Drawing Element Reference

23 element types across 7 categories:

### Basic

| Type | Key Props | Example Use |
|------|-----------|-------------|
| `rect` | `x, y, w, h` | Bounding boxes, regions |
| `ellipse` | `cx, cy, rx, ry` | Circles, ovals |
| `line` | `from, to` (Points) | Connectors, dividers |
| `arrow` | `from, to, label?` | Directed relationships |
| `text` | `x, y, text, size?, align?` | Labels, annotations |
| `latex` | `x, y, tex, displayMode?, fontSize?, align?` | Rendered LaTeX (MathJax TeX → SVG) |
| `clear` | *(none)* | Clears the canvas |

### Coordinate Systems

| Type | Key Props | Example Use |
|------|-----------|-------------|
| `cartesian_axes` | `x, y, width, height, xRange, yRange, xLabel?, yLabel?, gridlines?, style?` | Coordinate grids for function graphs |
| `number_line` | `x, y, length, min, max, label?, highlights?, intervals?` | 1-D ranges, inequalities |
| `vector_arrow` | `x, y, dx, dy, label?` | Physics vectors, basis vectors |

### Functions & Curves

| Type | Key Props | Example Use |
|------|-----------|-------------|
| `function_curve` | `x, y, width, height, xRange, yRange, expression?, points?` | `y = sin(x)`, piecewise functions |
| `parametric_curve` | `x, y, width, height, xRange, yRange, tMin, tMax, xExpression, yExpression, steps?` | Lissajous curves, spirals |
| `polar_plot` | `cx, cy, radius, expression, thetaMin?, thetaMax?, steps?, showPolarGrid?` | Rose curves, cardioids |

### Calculus

| Type | Key Props | Example Use |
|------|-----------|-------------|
| `tangent_line` | `x, y, width, height, xRange, yRange, expression, atX, length?, showPoint?` | Derivative visualisation |
| `integral_region` | `x, y, width, height, xRange, yRange, expression?, topPoints?, bottomPoints?, fillColor?, aLabel?, bLabel?` | Shaded area under a curve |
| `riemann_sum` | `x, y, width, height, xRange, yRange, expression, n?, method?, showFunction?, showAxes?` | Left/right/midpoint sums |
| `angle_arc` | `x, y, radius, startAngle, endAngle, label?` | Angle markers in geometry |

### Linear Algebra

| Type | Key Props | Example Use |
|------|-----------|-------------|
| `matrix_bracket` | `x, y, rows, bracketStyle, cellWidth?, cellHeight?, augmentedAt?` | Matrix display with brackets |
| `linear_transform` | `x, y, width, height, matrix, vectors?, showBasisVectors?, showOriginalGrid?, gridRange?` | 2-D transformation visualisation |

### Statistics

| Type | Key Props | Example Use |
|------|-----------|-------------|
| `histogram` | `x, y, width, height, bins: [{label, value, color?}], yMax?, showValues?, showAxes?, xLabel?, yLabel?` | Frequency distributions |
| `normal_distribution` | `x, y, width, height, mu, sigma, shadeFrom?, shadeTo?, shadeColor?, showMeanLine?, showSigmaLines?, showLabels?` | Bell curves, z-score shading |

### Geometry

| Type | Key Props | Example Use |
|------|-----------|-------------|
| `circle_with_radius` | `cx, cy, r, label?, showCenter?, showRadius?, radiusAngle?` | Labeled circles |
| `triangle_with_angles` | `vertices: [{x, y, label?} × 3], showAngles?, showSides?, sideLabels?, angleLabels?` | Labeled triangles |

---

## Drawing Payload Injection

Batches can be injected directly via HTTP without going through the chat model.

### `POST /api/whiteboard/inject`

| Detail | Value |
|--------|-------|
| Body | `DrawBatch \| SemanticBatch` (JSON, validated with Zod) |
| Headers | `X-Session-Id` (optional), `X-Sequence-Number` (optional) |
| Rate limit | 30 requests / 60 s |
| Max body | 256 KB |
| Response | `{ ok, batch, diagnostics }` (200) or `{ ok: false, error, message }` (422) |

**Minimal curl example:**

```bash
curl -X POST http://localhost:3000/api/whiteboard/inject \
  -H "Content-Type: application/json" \
  -d '{
    "batch_id": "demo-1",
    "elements": [
      { "type": "rect", "id": "r1", "x": 50, "y": 50, "w": 200, "h": 100, "color": "#3b82f6" },
      { "type": "text", "id": "t1", "x": 100, "y": 90, "text": "Hello from curl" }
    ]
  }'
```

### Injector UI

Press **Ctrl + Shift + I** (⌘ + Shift + I on macOS) to open the built-in Draw Payload Injector panel. It provides a JSON editor with real-time Zod validation, pre-built math templates, and a mini preview canvas.

---

## Export

| Format | Description |
|--------|-------------|
| **PNG** | Re-renders from stroke data (not a screen capture). Configurable scale (1–4×, default 2× retina). Max dimension 32 000 × 32 000 px. |
| **SVG** | Standalone SVG with Catmull-Rom → Bézier smoothing. Full-content export with padding. |
| **Clipboard** | Composites all 3 canvas layers into a PNG and copies to clipboard (requires HTTPS / secure context). |

### Scene Sharing via URL

The export button can generate a shareable URL with a `?scene=` query parameter containing a Base64-encoded snapshot of the current scene. Opening that URL restores the whiteboard state.

---

## Math Expression Syntax

The built-in expression parser (`graph-script.ts`) evaluates math expressions used by `function_curve`, `parametric_curve`, `polar_plot`, `riemann_sum`, `tangent_line`, and `integral_region`.

### Supported Functions

| Category | Functions |
|----------|-----------|
| Trigonometric | `sin`, `cos`, `tan`, `asin`, `acos`, `atan` |
| Hyperbolic | `sinh`, `cosh`, `tanh` |
| Exponential / Log | `exp`, `log`, `ln`, `log10`, `log2` |
| Roots / Absolute | `sqrt`, `abs` |
| Rounding | `floor`, `ceil`, `round`, `sign` |
| Two-argument | `pow(base, exp)`, `min(a, b)`, `max(a, b)` |

### Constants

| Name | Value |
|------|-------|
| `pi` / `PI` | 3.14159… |
| `e` / `E` | 2.71828… |

### Implicit Multiplication

The parser supports implicit multiplication so you can write natural math:

```
2x        → 2 * x
2sin(x)   → 2 * sin(x)
(x+1)(x-1) → (x+1) * (x-1)
```

### Example Expressions

```
sin(2*PI*x) / x
exp(-x^2 / 2) / sqrt(2*PI)
x^3 - 3*x + 1
```

---

## Colour Themes

| Theme | Description |
|-------|-------------|
| **default** | Light mode, professional. Blue/red/green curves on `#f7f9fc` background. |
| **dark** | Dark theme. Cyan/orange/green curves on `#1a1a2e` background. |
| **colorful** | Vibrant, saturated palette on warm `#fffef5` background. |
| **pastel** | Soft, muted lavender/pink/teal curves on `#faf5ff` background. |
| **monochrome** | Grayscale only. Three shades of grey on pure white. |

Each theme defines: `axis`, `grid`, `curve1`, `curve2`, `curve3`, `fill`, `text`, `background`.

---

## API Contract

### `POST /api/agent/stream`

Request body:

```json
{
  "sessionId": "string",
  "userMessage": "string",
  "plannerMode": "semantic_preferred | legacy_draw_only",
  "whiteboardContextV2": {
    "scene_summary": {},
    "occupied_regions": [],
    "anchors": [],
    "recent_blocks": [],
    "suggested_next_regions": [],
    "token_budget_hint": { "max_chars": 2200 }
  },
  "history": []
}
```

SSE events emitted:

| Event | Description |
|-------|-------------|
| `assistant.text.delta` | Incremental text token |
| `assistant.text.done` | Text stream complete |
| `whiteboard.batch` | Draw batch from model tool call |
| `whiteboard.layout.diagnostics` | Layout debug info |
| `warning` | Non-fatal warning |
| `error` | Error message |
| `turn.done` | Turn complete |

---

## Development

```bash
npm run dev          # Start Next.js dev server
npm test             # Run Vitest in watch mode
npm run test:run     # Run all 4 200+ unit tests with coverage
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # TypeScript type checking (tsc --noEmit)
npx playwright test  # E2E tests
```

### Requirements

- Node.js 20+
- OpenAI API key (for AI features; canvas/export work without one)

---

## Architecture Decisions

- **Transport-agnostic batches** — `applyDrawBatch()` is a pure function with no HTTP/SSE dependencies. Both the SSE stream (`/api/agent/stream`) and the injection endpoint (`/api/whiteboard/inject`) feed through the same pipeline, ensuring identical validation and rendering.

- **Batch sequencer** — A monotonic counter (`batch-sequencer.ts`) assigns sequence numbers to every batch, guaranteeing deterministic ordering regardless of network timing.

- **Coordinate system** — Canvas origin is top-left; Y increases downward. Math-oriented elements (`cartesian_axes`, `function_curve`, etc.) handle Y-axis inversion internally so authors can use standard mathematical conventions (Y up) in expressions and ranges.

- **Lowerer pattern** — High-level semantic elements are "lowered" into primitive strokes by `lowerer.ts`, which evaluates math expressions, generates point arrays, and compiles everything into animatable stroke data.

---

## Contributing

1. Fork & create a feature branch.
2. Run `npm run lint && npm run type-check && npm run test:run` before opening a PR.
3. E2E tests: `npx playwright test`.

---

## License

Private.
