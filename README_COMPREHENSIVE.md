# Next.js AI Whiteboard App - Comprehensive Documentation

## 1. DrawElement Types (23 Drawing Types)

The application supports **23 distinct DrawElement types** organized into the following categories:

### Basic Shapes (7 types)
- **rect** - Rectangle with x, y, w, h properties
  - `id` (string), `color` (hex), `stroke_width` (number), `lineStyle` ('solid'|'dashed'|'dotted')
  
- **ellipse** - Ellipse with center and radii
  - `cx`, `cy` (center), `rx`, `ry` (radii)
  
- **line** - Straight line segment
  - `from: {x, y}`, `to: {x, y}` (Point objects)
  
- **arrow** - Directional arrow
  - `from: {x, y}`, `to: {x, y}`, `label?` (optional text)
  
- **text** - Plain text rendering
  - `x`, `y` (position), `text` (string), `size?` (font size), `align?` ('left'|'center'|'right')
  
- **latex** - LaTeX math rendering
  - `x`, `y` (position), `tex` (LaTeX string), `displayMode?` (boolean), `fontSize?`, `align?`
  
- **clear** - Canvas clear element
  - Used to clear drawing state

### Math Coordinate Systems (4 types)
- **cartesian_axes** - 2D Cartesian coordinate system
  - `x`, `y` (top-left), `width`, `height`, `xRange: [min, max]`, `yRange: [min, max]`, `xLabel?`, `yLabel?`, `gridlines?`
  
- **number_line** - 1D number line
  - `x`, `y`, `length`, `min`, `max`, `label?`, `highlights?: [{value, label?}]`, `intervals?: [{from, to, color?}]`
  
- **polar_plot** - Polar coordinate system
  - `cx`, `cy` (center), `radius` (scale), `expression` (θ formula), `thetaMin?`, `thetaMax?`, `steps?` (default 200), `showPolarGrid?`
  
- **vector_arrow** - Vector with magnitude and direction
  - `x`, `y` (tail), `dx`, `dy` (components), `label?`

### Function/Curve Drawing (4 types)
- **function_curve** - Graph of y=f(x)
  - `x`, `y`, `width`, `height`, `xRange: [min, max]`, `yRange: [min, max]`, `expression?: string` (e.g., "Math.sin(x)"), `points?: [{x, y}]` (pre-sampled), `label?`
  
- **parametric_curve** - Parametric curve (x(t), y(t))
  - `x`, `y`, `width`, `height`, `xRange`, `yRange`, `tMin`, `tMax`, `xExpression`, `yExpression`, `steps?` (default 200)
  
- **riemann_sum** - Riemann sum visualization
  - `x`, `y`, `width`, `height`, `xRange`, `yRange`, `expression`, `n?` (rectangles), `method?` ('left'|'right'|'midpoint'), `showFunction?`, `showAxes?`
  
- **tangent_line** - Tangent line to curve at a point
  - `x`, `y`, `width`, `height`, `xRange`, `yRange`, `expression`, `atX` (tangent point), `length?`, `showPoint?`, `label?`

### Calculus/Analysis (2 types)
- **integral_region** - Shaded integration region
  - `x`, `y`, `width`, `height`, `xRange: [a, b]`, `yRange`, `topPoints?: [{x, y}]`, `bottomPoints?: [{x, y}]`, `expression?`, `fillColor?`, `fillOpacity?`, `strokeColor?`, `label?`, `aLabel?`, `bLabel?`
  
- **angle_arc** - Arc showing angle measurement
  - `x`, `y` (vertex), `radius`, `startAngle` (degrees), `endAngle` (degrees), `label?`

### Linear Algebra (2 types)
- **matrix_bracket** - Matrix with bracket notation
  - `x`, `y`, `rows: string[][]|string` (cell content or "1 0; 0 1"), `bracketStyle: '[]'|'()'|'||'|'{}'`, `cellWidth?`, `cellHeight?`, `augmentedAt?` (divider column index)
  
- **linear_transform** - 2×2 linear transformation visualization
  - `x`, `y`, `width`, `height`, `matrix: [[a,b],[c,d]]`, `vectors?: [{x, y, label?, color?}]`, `showBasisVectors?`, `showOriginalGrid?`, `gridRange?`, `label?`

### Statistics/Geometry (3 types)
- **histogram** - Bar chart visualization
  - `x`, `y`, `width`, `height`, `bins: [{label, value, color?}]`, `yMax?`, `showValues?`, `showAxes?`, `xLabel?`, `yLabel?`
  
- **normal_distribution** - Normal distribution curve
  - `x`, `y`, `width`, `height`, `mu` (mean), `sigma` (std dev), `shadeFrom?`, `shadeTo?`, `shadeColor?`, `showMeanLine?`, `showSigmaLines?`, `showLabels?`
  
- **circle_with_radius** - Circle with labeled radius
  - `cx`, `cy`, `r` (radius), `label?`, `showCenter?`, `showRadius?`, `radiusAngle?`
  
- **triangle_with_angles** - Triangle with angle and side annotations
  - `vertices: [{x, y, label?}, {x, y, label?}, {x, y, label?}]`, `showAngles?`, `showSides?`, `sideLabels?`, `angleLabels?`

**File Location:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/types/agent.ts` (lines 26-453)

---

## 2. Color Themes (5 Themes)

All themes are defined in the **ColorTheme** type and **THEME_MAP** object:

```typescript
type ColorTheme = 'default' | 'dark' | 'colorful' | 'pastel' | 'monochrome'
```

### Theme Properties (All themes include):
- `axis`: Color for coordinate axes and labels
- `grid`: Color for background grid lines
- `curve1`, `curve2`, `curve3`: Colors for multiple curves (cycling)
- `fill`: Fill color for shaded regions (with alpha)
- `text`: Text color
- `background`: Canvas background color

### Individual Themes:

1. **default** (Light professional)
   - axis: `#1f2a44` (dark blue)
   - grid: `#cccccc` (light gray)
   - curve1: `#4a90d9` (blue), curve2: `#e74c3c` (red), curve3: `#2ecc71` (green)
   - background: `#f7f9fc` (off-white)

2. **dark** (Dark mode)
   - axis: `#e0e0e0` (light gray)
   - grid: `#333333` (dark gray)
   - curve1: `#00bcd4` (cyan), curve2: `#ff7043` (orange), curve3: `#66bb6a` (green)
   - background: `#1a1a2e` (very dark)

3. **colorful** (Vibrant)
   - axis: `#222222` (nearly black)
   - grid: `#dddddd` (light gray)
   - curve1: `#2979ff` (blue), curve2: `#ff1744` (red), curve3: `#00c853` (bright green)
   - background: `#fffef5` (warm white)

4. **pastel** (Soft)
   - axis: `#5c5c7a` (muted purple)
   - grid: `#e0dce8` (light lavender)
   - curve1: `#b39ddb` (light purple), curve2: `#f48fb1` (pink), curve3: `#80cbc4` (mint)
   - background: `#faf5ff` (lavender white)

5. **monochrome** (Grayscale)
   - axis: `#111111` (black)
   - grid: `#cccccc` (light gray)
   - curve1: `#333333`, curve2: `#666666`, curve3: `#999999` (shades of gray)
   - background: `#ffffff` (white)

**File Location:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/lib/whiteboard/color-theme.ts`

---

## 3. Inject Endpoint (POST /api/whiteboard/inject)

### Route Handler
**File:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/app/api/whiteboard/inject/route.ts`

### Request Body Shape
Accepts a **union type** (either DrawBatch or SemanticBatch):

```typescript
type InjectBodySchema = DrawBatchSchema | SemanticBatchSchema

// DrawBatch structure:
interface DrawBatch {
  batch_id: string
  style_preset?: 'clean_pen_sketch' | 'rough_sketch' | 'blueprint_neat' | 'mathematical'
  elements: DrawElement[]  // Array of 23 DrawElement types
  source?: 'ai-stream' | 'injection' | 'template'
  schemaVersion?: number
  sequenceNumber?: number  // Monotonic for ordering (STATE-001)
  colorTheme?: ColorTheme
}
```

### Request Headers
- `X-Session-Id` (optional): Session identifier for auditing
- `X-Sequence-Number` (optional): Sequence number for batch ordering
- `Content-Type`: Must be `application/json`

### Validation & Processing
1. **Middleware stack** (applied in order):
   - Request ID generation (`withRequestId`)
   - Error boundary (`withErrorBoundary`)
   - Rate limiting: 30 requests per 60 seconds (`withRateLimit`)
   - Body size limit: 256 KB (`withBodySizeLimit`)
   - Content-Type validation (`withContentType`)
   - Schema validation (`withValidation`)

2. **Batch Processing** (via `applyDrawBatch`):
   - Normalizes payload (semantic → draw or draw → draw)
   - Clamps coordinates to valid bounds (SEC-006)
   - Enforces layout constraints (overlap prevention)
   - Returns diagnostics (violations fixed, fallback used)

### Response Shape (200 OK)
```typescript
interface InjectResult {
  ok: true
  batch: DrawBatch  // Processed batch
  diagnostics: {
    violationsFixed: string[]
    fallbackUsed: boolean
    elementCount: number
  }
}
```

### Error Response (422 Unprocessable Entity)
```typescript
interface InjectError {
  ok: false
  error: 'APPLY_FAILED'
  message: string  // Violation/warning details
  requestId: string
}
```

---

## 4. Injector UI & Keyboard Shortcut

### Keyboard Shortcut
**Shortcut:** `Ctrl+Shift+I` (or `Cmd+Shift+I` on Mac)

**File Location:** 
- Defined: `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/hooks/useKeyboardShortcuts.ts` (line 82-86)
- Documented: `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/components/whiteboard/KeyboardShortcutsHelp.tsx`

### Injector Component
**File:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/components/whiteboard/DrawPayloadInjector.tsx` (~500+ lines)

**Features:**
- **Template Categories**: All, Basic, Algebra, Calculus, Geometry, Linear Algebra, Statistics, Examples
- **10 Pre-built Math Templates**:
  - Cartesian Axes (-5,5)×(-5,5)
  - Number Line (-5 to 5)
  - Sine Wave (sin(x) from -2π to 2π)
  - Unit Circle with angle marks
  - Quadratic parabola
  - Derivative visualization
  - Matrix example
  - Statistics chart
  - Complex plane
  - Parametric spiral
  
- **JSON Editor**: Paste/edit DrawBatch JSON directly
- **Real-time Validation**: Client-side DrawBatchSchema validation before submission
- **Mini Preview Canvas**: Shows injected content before finalizing
- **Injector Hook**: `useDrawInjector()` manages the injection API calls

**Integration:**
- Triggered by `Ctrl+Shift+I` in `AppShell.tsx`
- Calls `/api/whiteboard/inject` endpoint
- Receives `InjectResult` with processed batch and diagnostics
- Integrates with animation sequencer for deterministic ordering

---

## 5. Export Functionality

### PNG Export
**File:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/lib/whiteboard/canvas-export.ts`

```typescript
export async function renderStrokesToBlob(
  strokes: StrokeTrajectory[],
  options: {
    format: 'png'
    scale: 1 | 2 | 4  // 1=72dpi, 2=retina, 4=print
    whiteBackground: boolean
    includeGrid: boolean
    padding: number
  }
): Promise<ExportResult>
```

- Uses **OffscreenCanvas** (with HTMLCanvasElement fallback for older browsers)
- Renders strokes using Catmull-Rom → Bézier smoothing
- Guards against OOM: max 32,000 px per side, 256 MP total pixel budget (EXPORT-001)
- Handles **tainted canvas SecurityError** (G1) by catching and suggesting SVG fallback
- Exports full content bounds, not just viewport (G2)

### SVG Export
```typescript
export function exportStrokesToSVG(
  strokes: StrokeTrajectory[],
  options?: { whiteBackground?: boolean; padding?: number }
): string
```

- Generates standalone SVG with proper XML escaping
- Uses same Catmull-Rom curve smoothing for consistency
- Full-content export with world-space bounds
- No SecurityError issues (safe for cross-origin content)

### Clipboard Export
```typescript
export async function copyCanvasLayersToClipboard(
  bgCanvas: HTMLCanvasElement,
  committedCanvas: HTMLCanvasElement,
  activeCanvas: HTMLCanvasElement
): Promise<void>
```

- Composites 3 canvas layers (background grid, committed strokes, active animation)
- Uses **Clipboard API** (`navigator.clipboard.write`)
- Requires **HTTPS context** (G7): auto-fallback to PNG download on error
- Handles SecurityError for tainted canvas

### Export Button Component
**File:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/components/whiteboard/ExportButton.tsx`

UI Controls:
- Format selector: PNG / SVG / Clipboard
- Scale selector: 1× / 2× (default) / 4×
- Background toggle: White / Transparent
- Real-time feedback messages

**File Download Mechanism:**
```typescript
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `whiteboard-${Date.now()}.${format}`
  document.body.appendChild(a)
  a.click()
  // Cleanup...
}
```

### Scene Sharing via URL (?scene= parameter)
**Status:** Not found in codebase. The app does NOT currently support scene serialization to URL parameters. The infrastructure exists for batches but no URL-based scene loading is implemented.

---

## 6. Math Expression Parser

**File:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/lib/whiteboard/graph-script.ts` (lines 691+)

### Supported Functions & Constants

**Trigonometric Functions (6):**
- `sin(x)`, `cos(x)`, `tan(x)` - Standard trig
- `asin(x)`, `acos(x)`, `atan(x)` - Inverse trig

**Hyperbolic Functions (3):**
- `sinh(x)`, `cosh(x)`, `tanh(x)`

**Logarithmic/Exponential (5):**
- `log(x)` - Natural logarithm (ln)
- `ln(x)` - Alias for natural log
- `log10(x)` - Base 10 logarithm
- `log2(x)` - Base 2 logarithm
- `exp(x)` - e^x

**Basic Math (5):**
- `sqrt(x)` - Square root
- `abs(x)` - Absolute value
- `floor(x)`, `ceil(x)`, `round(x)` - Rounding
- `sign(x)` - Sign function

**Two-Argument Functions (3):**
- `pow(a, b)` - Power (a^b)
- `min(a, b)`, `max(a, b)` - Min/Max

**Constants (2):**
- `pi` → Math.PI
- `e` → Math.E

**Operators:**
- `+`, `-`, `*`, `/`, `^` (power)
- Implicit multiplication: `2x`, `2sin(x)`, `(x+1)(x-1)`, `pi x`, etc.

### Expression Validation

**File:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/lib/schema.ts` (lines 6-16)

```typescript
function validateExpression(expr: string): { valid: boolean; error?: string } {
  try {
    const normalized = expr.replace(/\bMath\./g, '')
    const fn = parseMathExpression(normalized)
    if (!fn) return { valid: false, error: `Invalid expression: "${expr}"` }
    return { valid: true }
  } catch {
    return { valid: false, error: `Parse error in expression: "${expr}"` }
  }
}
```

**Parser Features:**
- Safe tokenization (no eval/new Function in the initial parse)
- Implicit multiplication handling
- AST construction with precedence parsing
- Fallback to `new Function` constructor for complex Math.* expressions

**Example Parsing:**
- `"sin(x)"` → Safe evaluation via EXPR_FUNCTIONS lookup
- `"x^2 + 1"` → Binary AST with exponentiation
- `"2sin(x) + cos(x)"` → Implicit multiplication + function calls
- `"max(x, 0)"` → Two-argument function evaluation

---

## 7. Key Architecture Files (10 Most Important)

| File | Lines | Purpose |
|------|-------|---------|
| **WhiteboardCanvas.tsx** | ~1000 | Main canvas component, 3-layer rendering (bg/committed/active), ref exports for export/history |
| **apply-draw-batch.ts** | ~120 | Transport-agnostic batch application logic (validation, constraint enforcement, coordinate clamping) |
| **lowerer.ts** | ~2000+ | Semantic → Draw lowering, element expansion, geometry computation, expression evaluation |
| **graph-script.ts** | ~1200+ | Math expression parser, safe evaluation, GraphScript DSL for semantic diagrams |
| **canvas-export.ts** | ~400 | PNG/SVG/clipboard export, layer compositing, OOM guards |
| **batch-sequencer.ts** | ~20 | Monotonic sequence number generation for deterministic ordering (STATE-001) |
| **color-theme.ts** | ~80 | 5 color theme definitions, theme lookup, curve color cycling |
| **useDrawInjector.ts** | ~90 | React hook for /api/whiteboard/inject POST requests, validation, error handling |
| **useKeyboardShortcuts.ts** | ~120 | Global keyboard shortcut bindings (Ctrl+Shift+I, Ctrl+K, Ctrl+Z, etc.) |
| **inject/route.ts** | ~90 | Express-like POST endpoint, middleware composition, schema validation |

**Total Codebase:** ~5,810 lines of TypeScript in `/src/lib/whiteboard/` alone

---

## 8. Canvas Layers Architecture (3-Layer Design)

**File:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/components/whiteboard/WhiteboardCanvas.tsx` (lines 104-106)

The application uses a **3-canvas compositing architecture**:

### Layer 1: Background Grid Canvas
- **Ref:** `bgRef`
- **Content:** Static background grid (30px spacing)
- **Update Trigger:** `gridDirtyRef` flag, recalculated when viewport changes
- **Color:** `rgba(77, 93, 118, 0.16)` (configurable via `readGridColors()`)
- **Purpose:** Persistent visual reference grid

### Layer 2: Committed Strokes Canvas
- **Ref:** `committedRef`
- **Content:** Completed, animated strokes
- **Data Source:** `committedStrokesRef` (array of StrokeTrajectory)
- **Update Trigger:** `committedDirtyRef` flag, set when batch completes animation
- **Purpose:** Stable content that persists as new animations play

### Layer 3: Active Animation Canvas
- **Ref:** `activeRef`
- **Content:** Currently animating strokes for the active batch
- **Data Source:** `activeStrokesRef` (array of ActiveStroke with timing info)
- **Update Cycle:** Per-frame via `requestAnimationFrame`
- **Purpose:** Real-time stroke animation with easing and speed variations

### Rendering Pipeline
```
Export/Display = [bgCanvas] + [committedCanvas] + [activeCanvas]
```

- **PNG Export:** `renderStrokesToBlob()` renders all strokes to OffscreenCanvas
- **SVG Export:** `exportStrokesToSVG()` converts stroke data directly
- **Clipboard:** `compositeCanvasLayers()` merges 3 layers with `ctx.drawImage()`

### Dirty Flags for Optimization
- `gridDirtyRef`: Recalculate grid only when viewport/zoom changes
- `committedDirtyRef`: Redraw committed layer only when batch animation completes
- Active layer is always redrawn per frame during animation

---

## 9. Batch Sequencer & Transport-Agnostic Design

### BatchSequencer Module
**File:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/lib/whiteboard/batch-sequencer.ts`

```typescript
export class BatchSequencer {
  private counter = 0
  
  next(): number {
    return ++this.counter
  }
  
  createSequenced<T>(batch: T): T & { sequenceNumber: number } {
    return { ...batch, sequenceNumber: this.next() }
  }
}

export const globalSequencer = new BatchSequencer()
```

**Purpose:** Ensures deterministic ordering of batches from multiple channels (STATE-001)
- SSE stream batches get stamped server-side
- Inject endpoint batches get stamped server-side  
- Client applies batches in sequence number order, regardless of network timing

### Apply-Draw-Batch (Transport-Agnostic Core)
**File:** `/Users/nb29255/Desktop/GitHubRepos/AgentsLeague/src/lib/server/whiteboard/apply-draw-batch.ts`

**Key Design:** Purely functional, no HTTP/SSE dependencies

```typescript
export function applyDrawBatch(
  rawBatch: DrawBatch | SemanticBatch,
  context: WhiteboardApplyContext
): ApplyResult {
  // 1. Normalize (semantic → draw)
  // 2. Clamp coordinates (SEC-006)
  // 3. Enforce constraints (overlaps, bounds)
  // 4. Return pure ApplyResult (no side effects)
}
```

**Inputs:**
- `rawBatch`: DrawBatch or SemanticBatch (JSON-deserializable)
- `context`: { sessionId, sequenceNumber, currentBatches? }

**Outputs:**
- `success`: boolean
- `batch`: Validated DrawBatch
- `sequenceNumber`: Assigned or override
- `warnings`: Array of violation messages

**Transport Independence:**
- ✅ Used by SSE stream route (`/api/agent/stream`)
- ✅ Used by inject route (`/api/whiteboard/inject`)
- ✅ Can be used by future batch APIs (WebSocket, batch uploads, etc.)
- ✅ No Request/Response types, no HTTP headers, no async I/O

**Integration Points:**
1. `/api/agent/stream` calls `applyDrawBatch` → streams batch over SSE
2. `/api/whiteboard/inject` calls `applyDrawBatch` → returns JSON response
3. Client receives `sequenceNumber` in batch header, applies in order

---

## 10. Test Coverage

**Total Test Files:** **313 test files**

**Test Framework:** Vitest (based on `vitest.config.ts`)

**Key Test Categories:**

1. **Whiteboard Core Tests** (`src/lib/whiteboard/__tests__/`):
   - `batch-sequencer.test.ts` - Sequence number generation
   - `function-curve.test.ts` - Expression parsing (sin, cos, tan, etc.)
   - `color-theme.test.ts` - Theme selection and color cycling
   - `injection-stress.test.ts` - Concurrent injection stress testing
   - `demo-payloads.test.ts` - Template payload validation

2. **API Route Tests** (`src/app/api/whiteboard/__tests__/`):
   - `inject-route.test.ts` - Request/response validation, error cases

3. **Server Core** (`src/lib/server/whiteboard/__tests__/`):
   - `apply-draw-batch.test.ts` - Transport-agnostic batch processing

4. **Canvas Component Tests** (`src/components/whiteboard/__tests__/`):
   - `WhiteboardCanvas-a11y.test.tsx` - Accessibility
   - `WhiteboardCanvas-error.test.tsx` - Error handling
   - `canvas-api-freeze.test.ts` - Canvas reference stability

5. **Hook Tests** (`src/hooks/__tests__/`):
   - `useAgentStream.test.ts` - SSE streaming
   - `useDrawHistory.test.ts` - Undo/redo history
   - `chat-hook-api.test.ts` - Chat integration

6. **UI Component Tests** (`src/lib/__tests__/`):
   - `keyboard-shortcuts.test.ts` - Shortcut bindings
   - `whiteboard-canvas-a11y.test.tsx` - Canvas accessibility
   - `message-content-memo.test.tsx` - Chat rendering
   - `component-accessibility.test.tsx` - General a11y

**Run Command:**
```bash
npm test
```

---

## Summary

This is a **sophisticated Next.js math visualization and diagramming platform** featuring:

✅ **23 DrawElement types** covering basic geometry through calculus and linear algebra  
✅ **5 color themes** for mathematical content styling  
✅ **Math expression parser** supporting 19+ functions and operators  
✅ **3-layer canvas** architecture for efficient batch animation  
✅ **Transport-agnostic batch processing** (SSE, HTTP inject, future APIs)  
✅ **Multiple export formats** (PNG, SVG, clipboard) with security handling  
✅ **313 test files** ensuring reliability  
✅ **Keyboard-driven UX** (Ctrl+Shift+I for injector, Ctrl+Shift+K for chat)  

**Codebase Size:** ~5,800 LOC in core whiteboard library, full app with all components ~30,000+ LOC

