# AI Whiteboard Drawing Engine — Technical Specification

## Table of Contents

1. [Drawing Spec Format](#1-drawing-spec-format)
2. [Rendering Pipeline](#2-rendering-pipeline)
3. [Incremental Drawing](#3-incremental-drawing)
4. [Shape Support](#4-shape-support)
5. [Text Handling](#5-text-handling)
6. [Performance](#6-performance)

---

## 1. Drawing Spec Format

The AI produces a `DrawingSpec` — a JSON document describing every visual element on the whiteboard. The format is designed to be streamable (elements can arrive one at a time) and order-independent (each element carries its own z-index).

### 1.1 Top-Level Schema

```typescript
interface DrawingSpec {
  version: "1.0";
  canvas: CanvasConfig;
  elements: DrawElement[];
}

interface CanvasConfig {
  width: number;          // logical pixels
  height: number;
  backgroundColor: string; // CSS color, default "#ffffff"
  dpi: number;             // default 2 for retina
}
```

### 1.2 Element Base

Every element extends a common base:

```typescript
interface ElementBase {
  id: string;              // unique stable ID (e.g. "rect-01")
  type: ElementType;
  position: { x: number; y: number }; // top-left anchor in logical px
  zIndex: number;          // higher = drawn later = on top
  opacity: number;         // 0.0–1.0, default 1.0
  rotation?: number;       // degrees, default 0
  style: StyleConfig;
  animation?: AnimationHint;
}

type ElementType =
  | "rectangle"
  | "circle"
  | "ellipse"
  | "line"
  | "arrow"
  | "polyline"
  | "text"
  | "highlight"
  | "group";

interface StyleConfig {
  stroke: string;          // CSS color
  strokeWidth: number;     // logical px
  strokeDash?: number[];   // dash pattern [dashLen, gapLen]
  fill?: string;           // CSS color or "none"
  shadow?: ShadowConfig;
  roughness?: number;      // 0 = precise, 1+ = hand-drawn wobble
}

interface ShadowConfig {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

interface AnimationHint {
  effect: "fadeIn" | "drawIn" | "popIn";
  durationMs: number;
  delayMs: number;
}
```

### 1.3 Element-Specific Schemas

```typescript
interface RectangleElement extends ElementBase {
  type: "rectangle";
  width: number;
  height: number;
  cornerRadius?: number;
}

interface CircleElement extends ElementBase {
  type: "circle";
  radius: number;
}

interface EllipseElement extends ElementBase {
  type: "ellipse";
  radiusX: number;
  radiusY: number;
}

interface LineElement extends ElementBase {
  type: "line";
  endPosition: { x: number; y: number };
}

interface ArrowElement extends ElementBase {
  type: "arrow";
  endPosition: { x: number; y: number };
  arrowHead: "triangle" | "open" | "diamond";
  arrowSize: number;      // px, default 10
  bidirectional?: boolean;
}

interface PolylineElement extends ElementBase {
  type: "polyline";
  points: { x: number; y: number }[];
  closed?: boolean;        // close the path?
}

interface TextElement extends ElementBase {
  type: "text";
  content: string;
  fontSize: number;        // logical px
  fontFamily: FontFamily;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  maxWidth?: number;       // word-wrap boundary
  lineHeight?: number;     // multiplier, default 1.4
  color: string;
}

type FontFamily =
  | "caveat"        // primary handwritten
  | "virgil"        // Excalidraw-style
  | "kalam"         // casual handwritten
  | "inter"         // clean sans-serif fallback
  | "monospace";    // code blocks

interface HighlightElement extends ElementBase {
  type: "highlight";
  width: number;
  height: number;
  highlightColor: string;  // semi-transparent, e.g. "rgba(255,235,59,0.35)"
}

interface GroupElement extends ElementBase {
  type: "group";
  children: DrawElement[];
}

type DrawElement =
  | RectangleElement
  | CircleElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | PolylineElement
  | TextElement
  | HighlightElement
  | GroupElement;
```

### 1.4 Example Spec from the AI

```json
{
  "version": "1.0",
  "canvas": { "width": 1200, "height": 800, "backgroundColor": "#fafafa", "dpi": 2 },
  "elements": [
    {
      "id": "title-1",
      "type": "text",
      "position": { "x": 100, "y": 40 },
      "zIndex": 10,
      "opacity": 1.0,
      "content": "System Architecture",
      "fontSize": 32,
      "fontFamily": "caveat",
      "fontWeight": "bold",
      "fontStyle": "normal",
      "textAlign": "left",
      "color": "#1a1a1a",
      "style": { "stroke": "none", "strokeWidth": 0 },
      "animation": { "effect": "fadeIn", "durationMs": 400, "delayMs": 0 }
    },
    {
      "id": "box-api",
      "type": "rectangle",
      "position": { "x": 100, "y": 120 },
      "zIndex": 5,
      "opacity": 1.0,
      "width": 180,
      "height": 80,
      "cornerRadius": 12,
      "style": {
        "stroke": "#4a90d9",
        "strokeWidth": 2,
        "fill": "#e8f0fe",
        "roughness": 0.6
      },
      "animation": { "effect": "drawIn", "durationMs": 600, "delayMs": 200 }
    },
    {
      "id": "arrow-1",
      "type": "arrow",
      "position": { "x": 280, "y": 160 },
      "endPosition": { "x": 400, "y": 160 },
      "zIndex": 6,
      "opacity": 1.0,
      "arrowHead": "triangle",
      "arrowSize": 12,
      "style": { "stroke": "#333", "strokeWidth": 2, "roughness": 0.4 },
      "animation": { "effect": "drawIn", "durationMs": 300, "delayMs": 800 }
    }
  ]
}
```

---

## 2. Rendering Pipeline

### 2.1 Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────┐
│ DrawingSpec  │────▶│  Sort & Plan │────▶│ Canvas Render │────▶│ Display  │
│  (JSON)      │     │  (z-index)   │     │  (2D Context) │     │ (screen) │
└─────────────┘     └──────────────┘     └───────────────┘     └──────────┘
       │                                        ▲
       │              ┌──────────────┐          │
       └─────────────▶│ Offscreen    │──────────┘
                      │ Layer Cache  │  (composite)
                      └──────────────┘
```

### 2.2 Core Renderer

```typescript
class WhiteboardRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private elements: Map<string, DrawElement> = new Map();
  private sortedIds: string[] = [];
  private dpr: number;
  private dirtyRegions: Set<string> = new Set(); // element IDs that need re-render

  constructor(canvas: HTMLCanvasElement, config: CanvasConfig) {
    this.canvas = canvas;
    this.dpr = config.dpi ?? window.devicePixelRatio;

    // Set physical size for crisp rendering
    canvas.width = config.width * this.dpr;
    canvas.height = config.height * this.dpr;
    canvas.style.width = `${config.width}px`;
    canvas.style.height = `${config.height}px`;

    this.ctx = canvas.getContext("2d")!;
    this.ctx.scale(this.dpr, this.dpr);
  }

  /** Ingest new/updated elements (called as AI streams data). */
  upsertElements(incoming: DrawElement[]): void {
    for (const el of incoming) {
      this.elements.set(el.id, el);
      this.dirtyRegions.add(el.id);
    }
    this.rebuildSortOrder();
    this.scheduleRender();
  }

  /** Rebuild the z-sorted draw order (only when elements change). */
  private rebuildSortOrder(): void {
    this.sortedIds = [...this.elements.keys()].sort((a, b) => {
      const ea = this.elements.get(a)!;
      const eb = this.elements.get(b)!;
      return ea.zIndex - eb.zIndex;
    });
  }

  /** Full repaint — used when too many dirty regions or on first render. */
  renderFull(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const id of this.sortedIds) {
      const el = this.elements.get(id)!;
      this.renderElement(el);
    }
    this.dirtyRegions.clear();
  }

  /** Dispatch to the correct shape renderer. */
  private renderElement(el: DrawElement): void {
    const { ctx } = this;
    ctx.save();

    // Apply transforms
    ctx.globalAlpha = el.opacity;
    if (el.rotation) {
      const cx = el.position.x + ((el as any).width ?? 0) / 2;
      const cy = el.position.y + ((el as any).height ?? 0) / 2;
      ctx.translate(cx, cy);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    // Apply shadow
    if (el.style.shadow) {
      ctx.shadowColor = el.style.shadow.color;
      ctx.shadowBlur = el.style.shadow.blur;
      ctx.shadowOffsetX = el.style.shadow.offsetX;
      ctx.shadowOffsetY = el.style.shadow.offsetY;
    }

    switch (el.type) {
      case "rectangle":  this.drawRect(el as RectangleElement); break;
      case "circle":     this.drawCircle(el as CircleElement); break;
      case "ellipse":    this.drawEllipse(el as EllipseElement); break;
      case "line":       this.drawLine(el as LineElement); break;
      case "arrow":      this.drawArrow(el as ArrowElement); break;
      case "polyline":   this.drawPolyline(el as PolylineElement); break;
      case "text":       this.drawText(el as TextElement); break;
      case "highlight":  this.drawHighlight(el as HighlightElement); break;
      case "group":      (el as GroupElement).children.forEach(c => this.renderElement(c)); break;
    }

    ctx.restore();
  }

  // --- individual renderers shown in §4 ---

  private pendingFrame: number | null = null;

  /** Coalesce multiple upserts into a single rAF paint. */
  private scheduleRender(): void {
    if (this.pendingFrame !== null) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = null;
      this.renderFull(); // or renderDirty() for partial updates
    });
  }
}
```

### 2.3 Rendering Order Rules

| Priority | Rule |
|----------|------|
| 1 | Background fill (canvas `backgroundColor`) |
| 2 | Highlights (low z-index by convention, `zIndex: 1–3`) |
| 3 | Shape fills, then shape strokes (same element) |
| 4 | Lines and arrows (`zIndex: 4–6`) |
| 5 | Text annotations (highest z-index, `zIndex: 7–10`) |

The AI controls exact layering via `zIndex`. The engine simply sorts by that value and paints in ascending order.

---

## 3. Incremental Drawing

The AI streams drawing elements via Server-Sent Events or a WebSocket. The engine must handle partial data gracefully.

### 3.1 Streaming Protocol

```typescript
// Each SSE event carries one or more element operations
interface DrawingEvent {
  op: "add" | "update" | "delete" | "clear";
  elements?: DrawElement[];    // for add/update
  ids?: string[];              // for delete
}
```

### 3.2 Stream Ingestion Controller

```typescript
class StreamingDrawController {
  private renderer: WhiteboardRenderer;
  private animationQueue: AnimatedElement[] = [];
  private isAnimating = false;

  constructor(renderer: WhiteboardRenderer) {
    this.renderer = renderer;
  }

  /** Connect to the AI's SSE endpoint. */
  connect(url: string): void {
    const source = new EventSource(url);
    source.onmessage = (event) => {
      const data: DrawingEvent = JSON.parse(event.data);
      this.handleEvent(data);
    };
  }

  private handleEvent(event: DrawingEvent): void {
    switch (event.op) {
      case "add":
      case "update":
        if (!event.elements) return;
        // Separate animated vs. instant elements
        const instant: DrawElement[] = [];
        const animated: DrawElement[] = [];

        for (const el of event.elements) {
          if (el.animation) {
            animated.push(el);
          } else {
            instant.push(el);
          }
        }

        // Render instant elements immediately
        if (instant.length) {
          this.renderer.upsertElements(instant);
        }

        // Queue animated elements
        for (const el of animated) {
          this.enqueueAnimation(el);
        }
        break;

      case "delete":
        if (event.ids) {
          for (const id of event.ids) {
            this.renderer.removeElement(id);
          }
        }
        break;

      case "clear":
        this.renderer.clear();
        break;
    }
  }

  /** Enqueue an element for animated reveal. */
  private enqueueAnimation(el: DrawElement): void {
    this.animationQueue.push({
      element: el,
      startTime: performance.now() + (el.animation?.delayMs ?? 0),
      duration: el.animation?.durationMs ?? 400,
      effect: el.animation?.effect ?? "fadeIn",
      progress: 0,
    });

    if (!this.isAnimating) {
      this.isAnimating = true;
      this.animationLoop();
    }
  }

  /** rAF loop that drives all queued animations. */
  private animationLoop(): void {
    const now = performance.now();
    const stillRunning: AnimatedElement[] = [];

    for (const anim of this.animationQueue) {
      if (now < anim.startTime) {
        stillRunning.push(anim); // not started yet
        continue;
      }

      const elapsed = now - anim.startTime;
      anim.progress = Math.min(elapsed / anim.duration, 1);

      // Apply the animation effect to the element
      const animated = this.applyEffect(anim);
      this.renderer.upsertElements([animated]);

      if (anim.progress < 1) {
        stillRunning.push(anim);
      }
    }

    this.animationQueue = stillRunning;

    if (stillRunning.length > 0) {
      requestAnimationFrame(() => this.animationLoop());
    } else {
      this.isAnimating = false;
    }
  }

  /** Apply animation effect, returning a modified element for this frame. */
  private applyEffect(anim: AnimatedElement): DrawElement {
    const el = structuredClone(anim.element);
    const t = this.easeOutCubic(anim.progress);

    switch (anim.effect) {
      case "fadeIn":
        el.opacity = t * (anim.element.opacity ?? 1);
        break;

      case "drawIn":
        // For lines/arrows: draw only the first t% of the path
        // For rectangles: animate strokeDashoffset
        el.opacity = 1;
        (el as any)._drawProgress = t;
        break;

      case "popIn":
        // Scale from 0 → 1 with overshoot
        const scale = t < 1 ? this.easeOutBack(t) : 1;
        (el as any)._scale = scale;
        el.opacity = Math.min(t * 2, 1);
        break;
    }

    return el;
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
}

interface AnimatedElement {
  element: DrawElement;
  startTime: number;   // performance.now() timestamp
  duration: number;     // ms
  effect: "fadeIn" | "drawIn" | "popIn";
  progress: number;     // 0→1
}
```

### 3.3 Draw-In Effect for Lines (Partial Path Rendering)

```typescript
/** Draw a line that "grows" from start to end based on progress (0→1). */
private drawLineWithProgress(el: LineElement, progress: number): void {
  const { ctx } = this;
  const { x: x1, y: y1 } = el.position;
  const { x: x2, y: y2 } = el.endPosition;

  // Interpolate endpoint
  const cx = x1 + (x2 - x1) * progress;
  const cy = y1 + (y2 - y1) * progress;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(cx, cy);
  ctx.strokeStyle = el.style.stroke;
  ctx.lineWidth = el.style.strokeWidth;
  ctx.lineCap = "round";
  ctx.stroke();
}

/** Draw a rectangle that traces its perimeter based on progress (0→1). */
private drawRectWithProgress(el: RectangleElement, progress: number): void {
  const { ctx } = this;
  const { x, y } = el.position;
  const { width: w, height: h } = el;
  const perimeter = 2 * (w + h);
  const drawn = perimeter * progress;

  // Fill is shown instantly (faded in); stroke traces progressively
  if (el.style.fill && el.style.fill !== "none") {
    ctx.fillStyle = el.style.fill;
    ctx.globalAlpha *= progress; // fade fill in sync
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha /= progress;
  }

  ctx.beginPath();
  ctx.strokeStyle = el.style.stroke;
  ctx.lineWidth = el.style.strokeWidth;
  ctx.setLineDash([drawn, perimeter]);
  ctx.lineDashOffset = 0;

  if (el.cornerRadius) {
    this.roundedRectPath(x, y, w, h, el.cornerRadius);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.stroke();
  ctx.setLineDash([]); // reset
}
```

---

## 4. Shape Support

### 4.1 Rectangle

```typescript
private drawRect(el: RectangleElement): void {
  const { ctx } = this;
  const { x, y } = el.position;
  const progress = (el as any)._drawProgress;

  if (progress !== undefined && progress < 1) {
    this.drawRectWithProgress(el, progress);
    return;
  }

  ctx.beginPath();
  if (el.cornerRadius) {
    this.roundedRectPath(x, y, el.width, el.height, el.cornerRadius);
  } else {
    ctx.rect(x, y, el.width, el.height);
  }

  if (el.style.fill && el.style.fill !== "none") {
    ctx.fillStyle = el.style.fill;
    ctx.fill();
  }

  if (el.style.stroke && el.style.stroke !== "none") {
    ctx.strokeStyle = el.style.stroke;
    ctx.lineWidth = el.style.strokeWidth;
    if (el.style.strokeDash) ctx.setLineDash(el.style.strokeDash);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

private roundedRectPath(
  x: number, y: number, w: number, h: number, r: number
): void {
  const { ctx } = this;
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
```

### 4.2 Circle & Ellipse

```typescript
private drawCircle(el: CircleElement): void {
  const { ctx } = this;
  const cx = el.position.x;
  const cy = el.position.y;

  ctx.beginPath();
  ctx.arc(cx, cy, el.radius, 0, Math.PI * 2);
  this.fillAndStroke(el);
}

private drawEllipse(el: EllipseElement): void {
  const { ctx } = this;
  ctx.beginPath();
  ctx.ellipse(
    el.position.x, el.position.y,
    el.radiusX, el.radiusY,
    0, 0, Math.PI * 2
  );
  this.fillAndStroke(el);
}

private fillAndStroke(el: DrawElement): void {
  const { ctx } = this;
  if (el.style.fill && el.style.fill !== "none") {
    ctx.fillStyle = el.style.fill;
    ctx.fill();
  }
  if (el.style.stroke && el.style.stroke !== "none") {
    ctx.strokeStyle = el.style.stroke;
    ctx.lineWidth = el.style.strokeWidth;
    if (el.style.strokeDash) ctx.setLineDash(el.style.strokeDash);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
```

### 4.3 Lines

```typescript
private drawLine(el: LineElement): void {
  const { ctx } = this;
  const progress = (el as any)._drawProgress;

  if (progress !== undefined && progress < 1) {
    this.drawLineWithProgress(el, progress);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(el.position.x, el.position.y);
  ctx.lineTo(el.endPosition.x, el.endPosition.y);
  ctx.strokeStyle = el.style.stroke;
  ctx.lineWidth = el.style.strokeWidth;
  ctx.lineCap = "round";
  if (el.style.strokeDash) ctx.setLineDash(el.style.strokeDash);
  ctx.stroke();
  ctx.setLineDash([]);
}
```

### 4.4 Arrows

```typescript
private drawArrow(el: ArrowElement): void {
  const { ctx } = this;
  const { x: x1, y: y1 } = el.position;
  const { x: x2, y: y2 } = el.endPosition;

  // Draw the shaft
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = el.style.stroke;
  ctx.lineWidth = el.style.strokeWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  // Draw arrowhead at end
  this.drawArrowHead(x1, y1, x2, y2, el);

  // Optionally draw arrowhead at start (bidirectional)
  if (el.bidirectional) {
    this.drawArrowHead(x2, y2, x1, y1, el);
  }
}

private drawArrowHead(
  fromX: number, fromY: number,
  toX: number, toY: number,
  el: ArrowElement
): void {
  const { ctx } = this;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const size = el.arrowSize ?? 10;

  ctx.save();
  ctx.translate(toX, toY);
  ctx.rotate(angle);

  ctx.beginPath();
  switch (el.arrowHead) {
    case "triangle":
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size / 2);
      ctx.lineTo(-size, size / 2);
      ctx.closePath();
      ctx.fillStyle = el.style.stroke;
      ctx.fill();
      break;

    case "open":
      ctx.moveTo(-size, -size / 2);
      ctx.lineTo(0, 0);
      ctx.lineTo(-size, size / 2);
      ctx.strokeStyle = el.style.stroke;
      ctx.lineWidth = el.style.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      break;

    case "diamond":
      ctx.moveTo(0, 0);
      ctx.lineTo(-size / 2, -size / 3);
      ctx.lineTo(-size, 0);
      ctx.lineTo(-size / 2, size / 3);
      ctx.closePath();
      ctx.fillStyle = el.style.stroke;
      ctx.fill();
      break;
  }
  ctx.restore();
}
```

### 4.5 Polyline (Freehand / Connector Paths)

```typescript
private drawPolyline(el: PolylineElement): void {
  const { ctx } = this;
  if (el.points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(
    el.position.x + el.points[0].x,
    el.position.y + el.points[0].y
  );

  // Use quadratic curves through midpoints for smooth paths
  for (let i = 1; i < el.points.length - 1; i++) {
    const curr = el.points[i];
    const next = el.points[i + 1];
    const midX = (el.position.x + curr.x + el.position.x + next.x) / 2;
    const midY = (el.position.y + curr.y + el.position.y + next.y) / 2;
    ctx.quadraticCurveTo(
      el.position.x + curr.x,
      el.position.y + curr.y,
      midX, midY
    );
  }

  // Last point
  const last = el.points[el.points.length - 1];
  ctx.lineTo(el.position.x + last.x, el.position.y + last.y);

  if (el.closed) ctx.closePath();

  this.fillAndStroke(el);
}
```

### 4.6 Highlight / Selection Box

```typescript
private drawHighlight(el: HighlightElement): void {
  const { ctx } = this;
  ctx.fillStyle = el.highlightColor;
  // Slight rotation for a "hand-placed" feel
  const wobble = (el.style.roughness ?? 0) * 1.5;
  ctx.save();
  if (wobble > 0) {
    const cx = el.position.x + el.width / 2;
    const cy = el.position.y + el.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(((Math.random() - 0.5) * wobble * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.fillRect(el.position.x, el.position.y, el.width, el.height);
  ctx.restore();
}
```

---

## 5. Text Handling

### 5.1 Font Loading Strategy

Fonts are critical for the whiteboard's visual quality. We use a cascading strategy:

```typescript
const FONT_CONFIG: Record<FontFamily, FontLoadSpec> = {
  caveat:    { url: "fonts/Caveat-Variable.woff2",     weight: "400 700", fallback: "virgil" },
  virgil:    { url: "fonts/Virgil.woff2",              weight: "400",     fallback: "kalam" },
  kalam:     { url: "fonts/Kalam-Regular.woff2",       weight: "400",     fallback: "inter" },
  inter:     { url: "fonts/Inter-Variable.woff2",      weight: "100 900", fallback: "sans-serif" },
  monospace: { url: "fonts/JetBrainsMono-Regular.woff2",weight: "400",    fallback: "monospace" },
};

interface FontLoadSpec {
  url: string;
  weight: string;
  fallback: FontFamily | string;
}

class FontManager {
  private loaded = new Set<FontFamily>();
  private loading = new Map<FontFamily, Promise<void>>();

  /** Ensure a font is loaded before we try to use it. */
  async ensureLoaded(family: FontFamily): Promise<string> {
    if (this.loaded.has(family)) return family;

    if (!this.loading.has(family)) {
      const spec = FONT_CONFIG[family];
      const face = new FontFace(family, `url(${spec.url})`, {
        weight: spec.weight,
        display: "swap",
      });

      this.loading.set(
        family,
        face.load()
          .then(() => {
            document.fonts.add(face);
            this.loaded.add(family);
          })
          .catch(() => {
            // Fallback: try the next font in the chain
            console.warn(`Font ${family} failed, falling back to ${spec.fallback}`);
            if (spec.fallback in FONT_CONFIG) {
              return this.ensureLoaded(spec.fallback as FontFamily).then(() => {});
            }
          })
      );
    }

    await this.loading.get(family);
    return this.loaded.has(family) ? family : this.resolveFallback(family);
  }

  private resolveFallback(family: FontFamily): string {
    const spec = FONT_CONFIG[family];
    if (this.loaded.has(spec.fallback as FontFamily)) return spec.fallback;
    return "sans-serif";
  }
}
```

### 5.2 Text Rendering

```typescript
private drawText(el: TextElement): void {
  const { ctx } = this;
  const resolvedFont = this.fontManager.getLoadedFontOrFallback(el.fontFamily);
  const lineHeight = (el.lineHeight ?? 1.4) * el.fontSize;

  ctx.font = `${el.fontStyle} ${el.fontWeight} ${el.fontSize}px ${resolvedFont}`;
  ctx.fillStyle = el.color;
  ctx.textAlign = el.textAlign;
  ctx.textBaseline = "top";

  // Word-wrap if maxWidth is set
  const lines = el.maxWidth
    ? this.wrapText(el.content, el.maxWidth)
    : el.content.split("\n");

  let yOffset = el.position.y;
  for (const line of lines) {
    let xPos = el.position.x;

    // Adjust x for center/right alignment
    if (el.textAlign === "center" && el.maxWidth) {
      xPos = el.position.x + el.maxWidth / 2;
    } else if (el.textAlign === "right" && el.maxWidth) {
      xPos = el.position.x + el.maxWidth;
    }

    ctx.fillText(line, xPos, yOffset);
    yOffset += lineHeight;
  }
}

/** Word-wrap text to fit within maxWidth. */
private wrapText(text: string, maxWidth: number): string[] {
  const { ctx } = this;
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
  }

  return lines;
}
```

### 5.3 Text Legibility Rules

| Scale Factor | Action |
|-------------|--------|
| > 2× zoom | Render at native size, let canvas scaling handle it |
| 1×–2× | Default rendering |
| 0.5×–1× | Bump font-weight to next level (400→500) |
| < 0.5× | Replace text with a placeholder rectangle; too small to read |
| Any scale | Minimum rendered font size: 8px logical |

```typescript
/** Adjust text rendering for current zoom level. */
private adjustTextForScale(el: TextElement, scale: number): TextElement {
  const adjusted = { ...el };
  const effectiveSize = el.fontSize * scale;

  if (effectiveSize < 8) {
    // Text would be illegible — replace with placeholder
    return null as any; // caller renders a gray bar instead
  }

  if (scale < 1 && scale >= 0.5) {
    // Bump weight for readability
    adjusted.fontWeight = el.fontWeight === "normal" ? "bold" : "bold";
  }

  return adjusted;
}
```

---

## 6. Performance

### 6.1 Render Coalescing

Multiple element updates arriving within the same frame are merged into a single repaint:

```typescript
class RenderScheduler {
  private dirty = false;
  private frameId: number | null = null;
  private renderer: WhiteboardRenderer;
  private lastFrameTime = 0;
  private frameBudgetMs = 16; // target 60fps

  constructor(renderer: WhiteboardRenderer) {
    this.renderer = renderer;
  }

  /** Mark the canvas as needing a repaint. */
  markDirty(): void {
    this.dirty = true;
    if (this.frameId === null) {
      this.frameId = requestAnimationFrame((ts) => this.onFrame(ts));
    }
  }

  private onFrame(timestamp: number): void {
    this.frameId = null;

    if (!this.dirty) return;
    this.dirty = false;

    const delta = timestamp - this.lastFrameTime;
    if (delta < this.frameBudgetMs * 0.5) {
      // Too soon — skip this frame, schedule next
      this.frameId = requestAnimationFrame((ts) => this.onFrame(ts));
      return;
    }

    this.lastFrameTime = timestamp;
    this.renderer.renderFull();
  }
}
```

### 6.2 Dirty-Region Rendering

For large canvases, full repaints are expensive. Track bounding boxes and only repaint affected areas:

```typescript
interface BoundingBox {
  x: number; y: number; width: number; height: number;
}

class DirtyRegionTracker {
  private regions: BoundingBox[] = [];

  addDirty(box: BoundingBox): void {
    this.regions.push(this.expandBox(box, 4)); // 4px bleed for anti-aliasing
  }

  /** Merge overlapping regions, return minimal clip rects. */
  getMergedRegions(): BoundingBox[] {
    if (this.regions.length === 0) return [];
    if (this.regions.length > 20) return []; // too many — just do full repaint

    // Simple merge: combine all into one bounding rect (good enough for <20 regions)
    const merged = this.regions.reduce((acc, r) => ({
      x: Math.min(acc.x, r.x),
      y: Math.min(acc.y, r.y),
      width: Math.max(acc.x + acc.width, r.x + r.width) - Math.min(acc.x, r.x),
      height: Math.max(acc.y + acc.height, r.y + r.height) - Math.min(acc.y, r.y),
    }));

    this.regions = [];
    return [merged];
  }

  /** Render only dirty regions using canvas clipping. */
  renderDirty(ctx: CanvasRenderingContext2D, renderFn: () => void): void {
    const regions = this.getMergedRegions();
    if (regions.length === 0) {
      renderFn(); // full repaint
      return;
    }

    ctx.save();
    ctx.beginPath();
    for (const r of regions) {
      ctx.rect(r.x, r.y, r.width, r.height);
    }
    ctx.clip();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    renderFn();
    ctx.restore();
  }

  private expandBox(box: BoundingBox, padding: number): BoundingBox {
    return {
      x: box.x - padding,
      y: box.y - padding,
      width: box.width + padding * 2,
      height: box.height + padding * 2,
    };
  }
}
```

### 6.3 Element Caching with Offscreen Canvas

Expensive elements (complex polylines, text with custom fonts) are rendered once to an offscreen canvas and composited as bitmaps:

```typescript
class ElementCache {
  private cache = new Map<string, OffscreenCanvas>();
  private maxCacheSize = 100;

  /** Get or create a cached rendering of an element. */
  getOrRender(
    el: DrawElement,
    bounds: BoundingBox,
    renderFn: (ctx: OffscreenCanvasRenderingContext2D) => void
  ): OffscreenCanvas {
    const cacheKey = `${el.id}@${JSON.stringify(el)}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey!);
    }

    const dpr = window.devicePixelRatio;
    const offscreen = new OffscreenCanvas(
      bounds.width * dpr,
      bounds.height * dpr
    );
    const offCtx = offscreen.getContext("2d")!;
    offCtx.scale(dpr, dpr);
    offCtx.translate(-bounds.x, -bounds.y);

    renderFn(offCtx);

    this.cache.set(cacheKey, offscreen);
    return offscreen;
  }

  /** Invalidate cache for a specific element (on update). */
  invalidate(elementId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(elementId + "@")) {
        this.cache.delete(key);
      }
    }
  }
}
```

### 6.4 Throttled AI Ingestion

When the AI produces elements faster than the renderer can paint, batch them:

```typescript
class IngestionThrottle {
  private buffer: DrawElement[] = [];
  private flushInterval = 32; // ms — ~2 flushes per frame at 60fps
  private timer: ReturnType<typeof setTimeout> | null = null;
  private renderer: WhiteboardRenderer;

  constructor(renderer: WhiteboardRenderer) {
    this.renderer = renderer;
  }

  /** Buffer an incoming element from the AI stream. */
  ingest(el: DrawElement): void {
    this.buffer.push(el);

    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  private flush(): void {
    this.timer = null;
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);
    this.renderer.upsertElements(batch);
  }
}
```

### 6.5 Performance Budget Summary

| Operation | Budget | Strategy |
|-----------|--------|----------|
| Full repaint | < 8ms | Offscreen caching, dirty regions |
| Element upsert | < 1ms | Map-based storage, deferred sort |
| Animation frame | < 4ms | Single rAF loop for all animations |
| Font load | < 500ms | Preload top 2 fonts, lazy-load rest |
| AI ingestion | Unbounded | 32ms flush batching |
| Memory (cache) | < 50MB | LRU eviction at 100 elements |

---

## Appendix: Roughness / Hand-Drawn Effect

When `style.roughness > 0`, the engine applies jitter to straight lines and curves to simulate hand-drawn strokes. This is inspired by [Rough.js](https://roughjs.com/) but implemented inline to avoid dependency overhead.

```typescript
/** Add hand-drawn wobble to a line segment. */
private roughLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  roughness: number
): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const segments = Math.max(2, Math.ceil(len / 20));
  const jitter = roughness * 2;

  ctx.beginPath();
  ctx.moveTo(
    x1 + (Math.random() - 0.5) * jitter,
    y1 + (Math.random() - 0.5) * jitter
  );

  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter;
    const py = y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter;
    ctx.lineTo(px, py);
  }

  ctx.stroke();

  // Double-stroke for a more natural pencil look
  if (roughness > 0.5) {
    ctx.beginPath();
    ctx.moveTo(
      x1 + (Math.random() - 0.5) * jitter * 0.5,
      y1 + (Math.random() - 0.5) * jitter * 0.5
    );
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      ctx.lineTo(
        x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter * 0.5,
        y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter * 0.5
      );
    }
    ctx.globalAlpha *= 0.4;
    ctx.stroke();
    ctx.globalAlpha /= 0.4;
  }
}
```
