# Interactive Drawing Selection & Annotation System — Technical Design

## Table of Contents

1. [Selection System](#1-selection-system)
2. [Highlighting & Annotation](#2-highlighting--annotation)
3. [Text Annotations](#3-text-annotations)
4. [Undo/Redo](#4-undoredo)
5. [Layering System](#5-layering-system)
6. [Gesture Support](#6-gesture-support)
7. [Export Options](#7-export-options)
8. [Performance at Scale](#8-performance-at-scale)
9. [Interaction Flow Diagrams](#9-interaction-flow-diagrams)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Shell                        │
├──────────┬──────────┬───────────┬──────────┬───────────┬────────┤
│ Selection│Highlight │   Text    │ Undo/Redo│  Layer    │ Export │
│  Engine  │  Engine  │ Annotation│  Manager │  Manager  │ Module │
├──────────┴──────────┴───────────┴──────────┴───────────┴────────┤
│                      Gesture Abstraction Layer                  │
├─────────────────────────────────────────────────────────────────┤
│                      Canvas Rendering Pipeline                  │
│              (HTML5 Canvas / SVG hybrid renderer)               │
├─────────────────────────────────────────────────────────────────┤
│                     Spatial Index (R-tree)                       │
├─────────────────────────────────────────────────────────────────┤
│                      Scene Graph (Element Store)                │
└─────────────────────────────────────────────────────────────────┘
```

### Core Data Model

```typescript
interface Element {
  id: string;                  // UUID
  type: ElementType;           // 'path' | 'rect' | 'ellipse' | 'text' | 'image' | 'group'
  bounds: AABB;                // axis-aligned bounding box { x, y, w, h }
  transform: Matrix2D;         // 3×3 affine transform (position, rotation, scale)
  style: StyleDescriptor;      // fill, stroke, opacity, etc.
  zIndex: number;              // layer ordering
  locked: boolean;
  visible: boolean;
  data: ElementData;           // type-specific payload (path points, text content, …)
  annotations: Annotation[];   // attached annotations
  parentId: string | null;     // group membership
}

interface Annotation {
  id: string;
  type: 'highlight' | 'box' | 'text' | 'pin';
  content: string;
  position: Point;
  style: AnnotationStyle;
  authorId: string;            // user or 'ai'
  createdAt: number;
}
```

---

## 1. Selection System

### 1.1 Selection Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Click-select** | Single pointer tap | Select topmost element under cursor |
| **Multi-select** | Shift+click | Toggle element in/out of selection set |
| **Marquee-select** | Click+drag on empty area | Rectangle lasso; select all intersecting |
| **Lasso-select** | Alt+drag | Freeform polygon lasso |
| **Select-all** | Ctrl/⌘+A | Add every visible, unlocked element |

### 1.2 Hit-Testing Pipeline

```
Pointer Event
  │
  ▼
┌──────────────────┐
│ Screen → World   │  apply inverse camera transform
│ coordinate map   │
└────────┬─────────┘
         ▼
┌──────────────────┐
│  R-tree query    │  spatial index returns candidate elements whose
│  (broad phase)   │  AABBs contain the world-space point
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Narrow-phase     │  per-candidate:
│ geometry test    │  • paths  → point-in-stroke / point-in-fill (isPointInPath)
│                  │  • rects  → AABB containment after inverse transform
│                  │  • text   → glyph bounding box test
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Z-order sort     │  sort surviving candidates by zIndex DESC,
│ & pick topmost   │  return first (topmost) hit
└──────────────────┘
```

### 1.3 Marquee / Lasso Selection

```
Drag Start (pointerdown on empty canvas)
  │
  ├─► begin selection rectangle / polygon
  │
  ▼
Drag Move (pointermove)
  │
  ├─► update rectangle / polygon geometry
  ├─► query R-tree for all elements intersecting the region
  ├─► highlight candidates in real-time (selection preview)
  │
  ▼
Drag End (pointerup)
  │
  ├─► finalize selection set
  ├─► emit 'selection:changed' event
  └─► render selection handles (resize, rotate)
```

### 1.4 Selection State

```typescript
class SelectionManager {
  private selected: Set<string> = new Set();

  select(id: string, additive = false): void {
    if (!additive) this.selected.clear();
    this.selected.add(id);
    this.emit('selection:changed', this.getSelectedElements());
  }

  deselect(id: string): void {
    this.selected.delete(id);
    this.emit('selection:changed', this.getSelectedElements());
  }

  selectByRegion(region: Polygon, mode: 'intersect' | 'contain'): void {
    const candidates = this.spatialIndex.query(region.bounds);
    for (const el of candidates) {
      const match = mode === 'contain'
        ? region.contains(el.bounds)
        : region.intersects(el.bounds);
      if (match && !el.locked) this.selected.add(el.id);
    }
    this.emit('selection:changed', this.getSelectedElements());
  }

  getCompositeAABB(): AABB {
    // returns bounding box enclosing all selected elements
  }
}
```

---

## 2. Highlighting & Annotation

### 2.1 Highlight Rendering Strategy

Highlights are rendered on a **dedicated overlay canvas** stacked above the main drawing canvas. This keeps the original drawing pixels untouched and allows GPU-composited blending.

```
┌──────────────────────────┐  z = 3   UI controls (HTML)
├──────────────────────────┤  z = 2   Annotation overlay canvas
├──────────────────────────┤  z = 1   Selection handles canvas
├──────────────────────────┤  z = 0   Main drawing canvas
└──────────────────────────┘
```

### 2.2 Highlight Types

```typescript
type HighlightStyle = {
  type: 'box' | 'underline' | 'glow' | 'tint';
  color: string;       // rgba
  thickness: number;   // stroke width for box/underline
  padding: number;     // gap between element bounds and highlight
  dashPattern?: number[];
  blendMode?: GlobalCompositeOperation;  // e.g. 'multiply' for marker effect
};
```

**Box Highlight (default for selection)**:

```typescript
function drawBoxHighlight(ctx: CanvasRenderingContext2D, bounds: AABB, style: HighlightStyle) {
  const { x, y, w, h } = expandAABB(bounds, style.padding);
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.thickness;
  if (style.dashPattern) ctx.setLineDash(style.dashPattern);
  ctx.strokeRect(x, y, w, h);
  // corner handles
  for (const corner of getCorners(x, y, w, h)) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(corner.x - 4, corner.y - 4, 8, 8);
    ctx.strokeRect(corner.x - 4, corner.y - 4, 8, 8);
  }
  ctx.restore();
}
```

**Marker / Tint Highlight (for AI-annotated areas)**:

```typescript
function drawTintHighlight(ctx: CanvasRenderingContext2D, bounds: AABB, style: HighlightStyle) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = style.color; // e.g. 'rgba(255, 255, 0, 0.3)'
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.restore();
}
```

### 2.3 Annotation Anchoring

Annotations anchor to elements via a relative offset so they follow the element when it moves:

```typescript
interface AnchoredAnnotation {
  elementId: string;
  anchorPoint: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  offset: Point;   // pixel offset from anchor point
}
```

```
  ┌─────────────────────────────┐
  │         Element             │
  │                             │◄── anchorPoint = 'top-right'
  └──────────────────────┬──────┘
                         │ offset = { x: 10, y: -20 }
                         ▼
                  ┌──────────────┐
                  │  Annotation  │
                  │  "Fix color" │
                  └──────────────┘
```

---

## 3. Text Annotations

### 3.1 Annotation Creation Flow

```
User/AI selects element(s)
  │
  ▼
Trigger annotation (toolbar button / AI action / keyboard shortcut 'N')
  │
  ▼
┌──────────────────────────┐
│  Place annotation pin    │  pin appears at anchor point on element
│  near selection          │
└────────────┬─────────────┘
             ▼
┌──────────────────────────┐
│  Open inline text editor │  <textarea> overlay positioned at pin
│  (contenteditable div)   │
└────────────┬─────────────┘
             ▼
User types text / AI inserts text
             │
             ▼
┌──────────────────────────┐
│  Commit annotation       │  escape / click-away / API call
│  → create Annotation obj │
│  → push UndoCommand      │
│  → re-render overlay     │
└──────────────────────────┘
```

### 3.2 Text Annotation Data Model

```typescript
interface TextAnnotation extends Annotation {
  type: 'text';
  content: string;           // markdown subset (bold, italic, code)
  maxWidth: number;          // word-wrap column width
  fontSize: number;
  fontFamily: string;
  backgroundColor: string;   // callout bubble color
  connectorStyle: 'line' | 'elbow' | 'curve';
}
```

### 3.3 Rendering

Text annotations render as **callout bubbles** with a connector line to the anchor:

```
             ┌────────────────────────┐
             │ This component handles │
             │ user authentication.   │
             └───────────┬────────────┘
                          \
                           \
                      ●─────● (anchor on element)
```

The connector line uses a quadratic Bézier curve routed to avoid overlapping other elements (simple obstacle avoidance via midpoint displacement).

### 3.4 AI-Generated Annotations

```typescript
interface AIAnnotationRequest {
  elementIds: string[];
  prompt?: string;            // optional user guidance
  context: 'explain' | 'review' | 'suggest';
}

interface AIAnnotationResponse {
  annotations: Array<{
    elementId: string;
    content: string;
    severity: 'info' | 'warning' | 'suggestion';
    anchorPoint: AnchorPoint;
  }>;
}
```

The AI pipeline:
1. Serialize selected elements to a compact scene description (SVG snippet + metadata).
2. Send to LLM with system prompt for drawing analysis.
3. Map response annotations back to element IDs.
4. Batch-create `TextAnnotation` objects via the command system (undoable).

---

## 4. Undo/Redo

### 4.1 Command Pattern

```typescript
interface Command {
  id: string;
  description: string;       // human-readable, shown in history panel
  execute(): void;
  undo(): void;
  merge?(other: Command): Command | null;  // for coalescing rapid edits
}

class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxDepth = 200;

  execute(cmd: Command): void {
    // attempt merge with last command (e.g. consecutive typing)
    const last = this.undoStack.at(-1);
    if (last?.merge) {
      const merged = last.merge(cmd);
      if (merged) {
        this.undoStack[this.undoStack.length - 1] = merged;
        merged.execute();
        this.redoStack = [];
        return;
      }
    }
    cmd.execute();
    this.undoStack.push(cmd);
    this.redoStack = [];
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.undoStack.push(cmd);
  }
}
```

### 4.2 Concrete Command Examples

```
┌──────────────────────┬────────────────────────────────────────────┐
│ Command              │ Stored State                               │
├──────────────────────┼────────────────────────────────────────────┤
│ AddElementCommand    │ serialized element snapshot                 │
│ DeleteElementCommand │ serialized element snapshot (for restore)   │
│ MoveElementCommand   │ { elementId, fromPos, toPos }              │
│ ResizeElementCommand │ { elementId, fromBounds, toBounds }        │
│ StyleChangeCommand   │ { elementId, fromStyle, toStyle }          │
│ ReorderCommand       │ { elementId, fromZIndex, toZIndex }        │
│ AddAnnotationCommand │ { annotation snapshot }                     │
│ BatchCommand         │ Command[] (groups atomic multi-element ops) │
└──────────────────────┴────────────────────────────────────────────┘
```

### 4.3 Merge Strategy for Moves

Consecutive `MoveElementCommand`s within 300ms are merged to avoid flooding the undo stack during drag operations:

```typescript
class MoveElementCommand implements Command {
  constructor(
    private elementId: string,
    private fromPos: Point,
    private toPos: Point,
    private timestamp: number
  ) {}

  merge(other: Command): Command | null {
    if (
      other instanceof MoveElementCommand &&
      other.elementId === this.elementId &&
      other.timestamp - this.timestamp < 300
    ) {
      return new MoveElementCommand(
        this.elementId, this.fromPos, other.toPos, other.timestamp
      );
    }
    return null;
  }

  execute() { elementStore.setPosition(this.elementId, this.toPos); }
  undo()    { elementStore.setPosition(this.elementId, this.fromPos); }
}
```

---

## 5. Layering System

### 5.1 Z-Order Model

Elements use a **fractional indexing** scheme (similar to Figma/Fractional Indexing) to allow insertions between any two elements without renumbering:

```typescript
import { generateKeyBetween } from 'fractional-indexing';

class LayerManager {
  // orderKey is a lexicographically sortable string
  private elements: Map<string, { orderKey: string; element: Element }>;

  moveToFront(id: string): void {
    const maxKey = this.getMaxOrderKey();
    const newKey = generateKeyBetween(maxKey, null);
    this.setOrderKey(id, newKey);
    this.commandHistory.execute(new ReorderCommand(id, oldKey, newKey));
  }

  moveToBack(id: string): void {
    const minKey = this.getMinOrderKey();
    const newKey = generateKeyBetween(null, minKey);
    this.setOrderKey(id, newKey);
  }

  moveAbove(id: string, targetId: string): void {
    const targetKey = this.getOrderKey(targetId);
    const aboveKey = this.getNextOrderKey(targetKey);
    const newKey = generateKeyBetween(targetKey, aboveKey);
    this.setOrderKey(id, newKey);
  }

  getRenderOrder(): Element[] {
    return [...this.elements.values()]
      .sort((a, b) => a.orderKey < b.orderKey ? -1 : 1)
      .map(e => e.element);
  }
}
```

### 5.2 Layer Groups

```
┌─────────────────────────┐
│  Layer: Annotations     │  ← always on top, semi-transparent
├─────────────────────────┤
│  Layer: User Drawings   │  ← user-created shapes, text, images
├─────────────────────────┤
│  Layer: Grid / Guides   │  ← non-selectable background
└─────────────────────────┘
```

Each layer is independently lockable and visibility-toggleable. Elements within a layer follow the fractional-index ordering.

### 5.3 Render Pipeline (per frame)

```
for each layer (bottom → top):
  if layer.visible:
    for each element in layer.getRenderOrder():
      if element.bounds intersects viewport:    ← frustum culling
        applyTransform(element.transform)
        render(element)
```

---

## 6. Gesture Support

### 6.1 Unified Pointer Abstraction

```typescript
interface NormalizedPointer {
  id: number;            // pointer ID (supports multi-touch)
  x: number;             // world-space x
  y: number;             // world-space y
  pressure: number;      // 0–1, from stylus
  tiltX: number;         // stylus tilt
  tiltY: number;
  pointerType: 'mouse' | 'touch' | 'pen';
  timestamp: number;
}

class GestureRecognizer {
  private activePointers: Map<number, NormalizedPointer[]> = new Map();

  onPointerDown(e: PointerEvent)  { /* track */ }
  onPointerMove(e: PointerEvent)  { /* update + classify */ }
  onPointerUp(e: PointerEvent)    { /* finalize */ }

  private classify(): GestureType {
    const count = this.activePointers.size;
    if (count === 1) return this.classifySinglePointer();
    if (count === 2) return this.classifyTwoPointer();
    return 'none';
  }
}
```

### 6.2 Gesture State Machine

```
                    ┌───────────┐
         ┌────────►│   IDLE    │◄──────────────────┐
         │         └─────┬─────┘                    │
         │               │ pointerdown              │ pointerup / cancel
         │               ▼                          │
         │         ┌───────────┐                    │
         │    ┌───►│  PENDING  │────────┐           │
         │    │    └─────┬─────┘        │           │
         │    │          │              │ 2nd pointer│
         │    │  moved > │              │ down       │
         │    │  5px     │              ▼            │
         │    │          │        ┌───────────┐      │
         │    │          │        │ TWO_FINGER │      │
         │    │          ▼        └─────┬─────┘      │
         │    │   ┌────────────┐       │             │
         │    │   │   DRAG     │       ├─► PINCH_ZOOM│
         │    │   │ (move/     │       ├─► PAN       │
         │    │   │  select/   │       └─► ROTATE    │
         │    │   │  draw)     │             │       │
         │    │   └──────┬─────┘             │       │
         │    │          │                   │       │
         └────┘          └───────────────────┴───────┘
```

### 6.3 Pinch-to-Zoom

```typescript
function handlePinchZoom(prev: [Point, Point], curr: [Point, Point], camera: Camera) {
  const prevDist = distance(prev[0], prev[1]);
  const currDist = distance(curr[0], curr[1]);
  const scaleFactor = currDist / prevDist;

  const prevCenter = midpoint(prev[0], prev[1]);
  const currCenter = midpoint(curr[0], curr[1]);

  // zoom around pinch center
  camera.zoomAt(currCenter, scaleFactor);

  // pan by center displacement
  const dx = currCenter.x - prevCenter.x;
  const dy = currCenter.y - prevCenter.y;
  camera.pan(dx, dy);
}
```

### 6.4 Touch-Specific Affordances

| Gesture | Action | Threshold |
|---------|--------|-----------|
| Tap | Select element | < 200ms, < 5px movement |
| Double-tap | Edit text / enter group | < 400ms between taps |
| Long-press (500ms) | Context menu | hold still for 500ms |
| Single-finger drag | Move selected / draw | > 5px movement |
| Two-finger drag | Pan canvas | both fingers move same direction |
| Pinch | Zoom in/out | distance change > 10px |
| Two-finger rotate | Rotate selected element | angle change > 5° |
| Three-finger swipe left | Undo | |
| Three-finger swipe right | Redo | |

---

## 7. Export Options

### 7.1 Export Pipeline

```
Scene Graph
  │
  ▼
┌─────────────────────────────┐
│  Export Preprocessor         │
│  • flatten groups            │
│  • apply transforms          │
│  • resolve styles            │
│  • optionally include/       │
│    exclude annotations       │
└──────────┬──────────────────┘
           │
    ┌──────┼──────────┐
    ▼      ▼          ▼
┌──────┐┌──────┐ ┌────────┐
│ PNG  ││ SVG  │ │  PDF   │
│Render││Serial│ │Generate│
└──┬───┘└──┬───┘ └───┬────┘
   │       │         │
   ▼       ▼         ▼
  Blob    String    Blob
   │       │         │
   └───────┴────┬────┘
                ▼
         Download / Share
```

### 7.2 PNG Export

```typescript
async function exportPNG(
  scene: SceneGraph,
  options: { scale: number; background: string; includeAnnotations: boolean }
): Promise<Blob> {
  const bounds = scene.getContentBounds();
  const w = bounds.w * options.scale;
  const h = bounds.h * options.scale;

  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext('2d')!;

  ctx.scale(options.scale, options.scale);
  ctx.translate(-bounds.x, -bounds.y);

  // background
  ctx.fillStyle = options.background;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

  // render all elements in z-order
  for (const el of scene.getRenderOrder()) {
    renderElement(ctx, el);
  }

  if (options.includeAnnotations) {
    for (const ann of scene.getAnnotations()) {
      renderAnnotation(ctx, ann);
    }
  }

  return offscreen.convertToBlob({ type: 'image/png' });
}
```

### 7.3 SVG Export

```typescript
function exportSVG(scene: SceneGraph, options: ExportOptions): string {
  const bounds = scene.getContentBounds();
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}">`,
    `<defs>${generateGradientDefs(scene)}</defs>`,
  ];

  for (const el of scene.getRenderOrder()) {
    parts.push(elementToSVG(el));   // path→<path>, rect→<rect>, text→<text>
  }

  if (options.includeAnnotations) {
    parts.push('<g class="annotations">');
    for (const ann of scene.getAnnotations()) {
      parts.push(annotationToSVG(ann));
    }
    parts.push('</g>');
  }

  parts.push('</svg>');
  return parts.join('\n');
}
```

### 7.4 PDF Export

Uses an embedded library (e.g., `jsPDF` or `pdf-lib`) that accepts the same render commands:

```typescript
async function exportPDF(scene: SceneGraph, options: ExportOptions): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const bounds = scene.getContentBounds();
  const page = doc.addPage([bounds.w, bounds.h]);

  for (const el of scene.getRenderOrder()) {
    drawElementToPDF(page, el, bounds);
  }

  return doc.save();
}
```

---

## 8. Performance at Scale

### 8.1 Spatial Indexing

An **R-tree** (`rbush` library) indexes all element AABBs for O(log n) spatial queries:

```typescript
import RBush from 'rbush';

interface RTreeItem { minX: number; minY: number; maxX: number; maxY: number; id: string; }

class SpatialIndex {
  private tree = new RBush<RTreeItem>();

  insert(el: Element): void {
    this.tree.insert({
      minX: el.bounds.x,
      minY: el.bounds.y,
      maxX: el.bounds.x + el.bounds.w,
      maxY: el.bounds.y + el.bounds.h,
      id: el.id,
    });
  }

  queryViewport(viewport: AABB): string[] {
    return this.tree.search({
      minX: viewport.x, minY: viewport.y,
      maxX: viewport.x + viewport.w, maxY: viewport.y + viewport.h,
    }).map(item => item.id);
  }

  // Bulk-load is 10x faster than individual inserts for initial load
  bulkLoad(elements: Element[]): void {
    this.tree.load(elements.map(el => ({ /* ... */ })));
  }
}
```

### 8.2 Viewport Culling

Only elements intersecting the current viewport are rendered:

```typescript
function renderFrame(ctx: CanvasRenderingContext2D, scene: SceneGraph, camera: Camera) {
  const viewport = camera.getWorldViewport();
  const visibleIds = scene.spatialIndex.queryViewport(viewport);
  const visibleElements = visibleIds
    .map(id => scene.getElementById(id))
    .filter(el => el.visible)
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey));

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  camera.applyToContext(ctx);

  for (const el of visibleElements) {
    renderElement(ctx, el);
  }

  ctx.restore();
}
```

### 8.3 Tiered Rendering (Level of Detail)

```
┌─────────────────────────────────────────────────────┐
│  Zoom level        │  Rendering strategy             │
├────────────────────┼─────────────────────────────────┤
│  < 10% (far out)   │  Colored rectangles (AABB only) │
│  10–50%            │  Simplified paths (Douglas-      │
│                    │  Peucker decimation)             │
│  50–200%           │  Full fidelity                   │
│  > 200% (zoomed in)│  Sub-pixel anti-aliasing,        │
│                    │  show control points             │
└────────────────────┴─────────────────────────────────┘
```

### 8.4 Rendering Budget & Frame Pacing

```typescript
const FRAME_BUDGET_MS = 12; // target < 16.67ms for 60fps

function renderWithBudget(elements: Element[], ctx: CanvasRenderingContext2D) {
  const start = performance.now();
  let rendered = 0;

  for (const el of elements) {
    if (performance.now() - start > FRAME_BUDGET_MS) {
      // defer remaining to next frame
      requestAnimationFrame(() => renderWithBudget(elements.slice(rendered), ctx));
      return;
    }
    renderElement(ctx, el);
    rendered++;
  }
}
```

### 8.5 Additional Optimizations

| Technique | Description | Impact |
|-----------|-------------|--------|
| **Dirty-rect rendering** | Only repaint changed regions, not full canvas | 2–10× faster updates |
| **Off-screen bitmap cache** | Rasterize complex elements to cached bitmaps | Eliminates re-rendering static elements |
| **Web Workers** | Offload R-tree queries and path simplification | Keeps main thread responsive |
| **OffscreenCanvas** | Render in worker thread (Chrome/Edge) | True parallel rendering |
| **requestIdleCallback** | Precompute LOD thumbnails during idle time | Smoother zoom transitions |
| **Element pooling** | Reuse DOM/canvas objects for annotations | Reduces GC pressure |
| **Incremental R-tree** | Update spatial index incrementally on element change | Avoids full rebuild |

### 8.6 Scale Targets

| Metric | Target | Strategy |
|--------|--------|----------|
| Elements on canvas | 100,000+ | R-tree + viewport culling + LOD |
| Annotations | 10,000+ | Virtual list, only render visible |
| Frame rate | 60 fps | Frame budget, dirty rects, caching |
| Selection response | < 50ms | R-tree broad phase, typed array geometry |
| Export (PNG) | < 3s for 10k elements | OffscreenCanvas in Worker |
| Memory | < 500MB for 100k elements | Flyweight pattern for shared styles |

---

## 9. Interaction Flow Diagrams

### 9.1 Complete User Selection & Annotation Flow

```
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌────────────┐
│  User    │     │  Gesture │     │ Selection │     │ Annotation │
│  Input   │     │  Layer   │     │  Manager  │     │   Engine   │
└────┬─────┘     └────┬─────┘     └─────┬─────┘     └─────┬──────┘
     │                │                  │                  │
     │ pointerdown    │                  │                  │
     ├───────────────►│                  │                  │
     │                │ normalize +      │                  │
     │                │ classify         │                  │
     │                │                  │                  │
     │ pointermove    │                  │                  │
     ├───────────────►│                  │                  │
     │                │  if DRAG:        │                  │
     │                │  marquee region  │                  │
     │                ├─────────────────►│                  │
     │                │                  │ queryRTree()     │
     │                │                  │ highlight        │
     │                │                  │ candidates       │
     │                │                  │                  │
     │ pointerup      │                  │                  │
     ├───────────────►│                  │                  │
     │                │  finalize        │                  │
     │                ├─────────────────►│                  │
     │                │                  │ emit             │
     │                │                  │ selection:changed│
     │                │                  │                  │
     │ press 'N'      │                  │                  │
     ├────────────────┼──────────────────┼─────────────────►│
     │                │                  │                  │ create pin
     │                │                  │                  │ open editor
     │                │                  │                  │
     │ type text      │                  │                  │
     ├────────────────┼──────────────────┼─────────────────►│
     │                │                  │                  │
     │ press Escape   │                  │                  │
     ├────────────────┼──────────────────┼─────────────────►│
     │                │                  │                  │ commit
     │                │                  │                  │ → Command
     │                │                  │                  │   History
     │                │                  │                  │
     │ Ctrl+Z         │                  │                  │
     ├────────────────┼──────────────────┼────────┐        │
     │                │                  │        ▼        │
     │                │                  │   CommandHistory │
     │                │                  │     .undo()     │
     │                │                  │   removes       │
     │                │                  │   annotation    │
     ▼                ▼                  ▼                  ▼
```

### 9.2 AI Annotation Flow

```
┌──────────┐    ┌───────────┐    ┌─────────┐    ┌───────────┐
│   User   │    │ Selection │    │   AI    │    │ Annotation│
│          │    │  Manager  │    │ Service │    │  Engine   │
└────┬─────┘    └─────┬─────┘    └────┬────┘    └─────┬─────┘
     │                │               │               │
     │ select elements│               │               │
     ├───────────────►│               │               │
     │                │               │               │
     │ click "AI      │               │               │
     │  Annotate"     │               │               │
     ├────────────────┼──────────────►│               │
     │                │               │               │
     │                │  serialize    │               │
     │                │  selection    │               │
     │                ├──────────────►│               │
     │                │               │               │
     │                │               │ analyze       │
     │                │               │ (LLM call)    │
     │                │               │               │
     │                │               │ annotations[] │
     │                │               ├──────────────►│
     │                │               │               │
     │                │               │               │ batch create
     │                │               │               │ via BatchCommand
     │                │               │               │
     │◄───────────────┼───────────────┼───────────────┤
     │  render annotations with       │               │
     │  severity-coded colors         │               │
     ▼                ▼               ▼               ▼
```

### 9.3 Export Flow

```
User clicks Export
  │
  ├─► Choose format: [PNG] [SVG] [PDF]
  │
  ├─► Configure options:
  │     ☑ Include annotations
  │     ☑ Transparent background
  │     Scale: [1x ▾]  [2x]  [3x]
  │     Area:  [Full canvas ▾]  [Selection only]  [Custom crop]
  │
  ├─► Click "Export"
  │
  ├─► Progress indicator (for large canvases)
  │     ┌────████████████░░░░░░░┐ 65%
  │     └──────────────────────┘
  │
  └─► Browser download dialog / Blob URL
```

---

## Appendix: Module Dependency Graph

```
                    ┌──────────┐
                    │  App     │
                    │  Shell   │
                    └────┬─────┘
           ┌─────────┬──┴──┬─────────┬──────────┐
           ▼         ▼     ▼         ▼          ▼
      ┌────────┐ ┌──────┐ ┌───────┐ ┌──────┐ ┌──────┐
      │Toolbar │ │Canvas│ │Layers │ │Export│ │History│
      │   UI   │ │Render│ │ Panel │ │ UI   │ │Panel │
      └───┬────┘ └──┬───┘ └──┬────┘ └──┬───┘ └──┬───┘
          │         │        │         │        │
          └────┬────┴────┬───┴────┬────┘        │
               ▼         ▼       ▼              ▼
          ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────┐
          │Gesture │ │Select  │ │Layer   │ │Command  │
          │Recogn. │ │Manager │ │Manager │ │History  │
          └───┬────┘ └───┬────┘ └───┬────┘ └─────────┘
              │          │         │
              └─────┬────┴─────────┘
                    ▼
              ┌───────────┐
              │ Spatial   │
              │ Index     │
              │ (R-tree)  │
              └─────┬─────┘
                    ▼
              ┌───────────┐
              │ Scene     │
              │ Graph     │
              │ (Store)   │
              └───────────┘
```

---

## File Structure (Proposed)

```
src/
├── core/
│   ├── scene-graph.ts         # Element store, CRUD operations
│   ├── spatial-index.ts       # R-tree wrapper
│   ├── camera.ts              # Viewport, zoom, pan transforms
│   └── types.ts               # Shared interfaces & types
├── selection/
│   ├── selection-manager.ts   # Selection state & hit-testing
│   ├── marquee.ts             # Rectangle/lasso selection
│   └── handles.ts             # Resize/rotate handle rendering
├── annotation/
│   ├── annotation-engine.ts   # Create, update, delete annotations
│   ├── text-editor.ts         # Inline text editing overlay
│   ├── connector.ts           # Callout line routing
│   └── ai-annotator.ts        # AI annotation pipeline
├── history/
│   ├── command-history.ts     # Undo/redo stack
│   ├── commands/
│   │   ├── add-element.ts
│   │   ├── delete-element.ts
│   │   ├── move-element.ts
│   │   ├── style-change.ts
│   │   ├── reorder.ts
│   │   ├── add-annotation.ts
│   │   └── batch.ts
│   └── merge-strategies.ts    # Command coalescing logic
├── layers/
│   ├── layer-manager.ts       # Z-order, fractional indexing
│   └── layer-panel.ts         # UI component
├── gestures/
│   ├── gesture-recognizer.ts  # Pointer event normalization
│   ├── pinch-zoom.ts          # Two-finger zoom handler
│   └── state-machine.ts       # Gesture classification FSM
├── export/
│   ├── export-png.ts          # OffscreenCanvas rasterization
│   ├── export-svg.ts          # SVG serialization
│   ├── export-pdf.ts          # PDF generation via pdf-lib
│   └── preprocessor.ts        # Flatten, resolve styles
├── rendering/
│   ├── renderer.ts            # Main render loop
│   ├── dirty-rects.ts         # Incremental repaint
│   ├── lod.ts                 # Level-of-detail switching
│   └── element-cache.ts       # Bitmap caching for complex elements
└── ui/
    ├── toolbar.ts
    ├── history-panel.ts
    └── export-dialog.ts
```
