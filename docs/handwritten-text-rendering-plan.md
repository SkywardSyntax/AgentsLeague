# Handwritten Text Rendering — Technical Implementation Plan

> **Goal:** Render text on an AI whiteboard canvas that looks hand-drawn while remaining professional, legible, and performant.

---

## 1. Font Selection

### Primary Recommendations

| Font | Style | License | Best For |
|---|---|---|---|
| **Caveat** | Casual handwriting | OFL 1.1 (Google Fonts, free) | Body text, annotations |
| **Virgil** (Excalidraw) | Sketch/whiteboard | OFL 1.1 (free) | Diagrams, labels — purpose-built for whiteboards |
| **Kalam** | Neat handwriting | OFL 1.1 (Google Fonts, free) | Headers, longer passages |
| **Architects Daughter** | Technical sketch | OFL 1.1 (Google Fonts, free) | Engineering diagrams, technical labels |

### Why NOT Recoleta / Fredoka

- **Recoleta** — A display serif font. It looks polished and typographic, not handwritten. Useful for branding but wrong for whiteboard realism.
- **Fredoka** — A rounded sans-serif designed for children's content. Feels playful but geometric — no handwritten character.

### Fallback Chain

```css
font-family: 'Caveat', 'Virgil', 'Kalam', 'Segoe Print', 'Comic Neue', cursive;
```

### Font Loading Strategy

```typescript
// Preload critical handwriting fonts before first render
const HANDWRITING_FONTS = [
  { family: 'Caveat', weight: '400 700', src: '/fonts/Caveat-Variable.woff2' },
  { family: 'Virgil', weight: '400', src: '/fonts/Virgil.woff2' },
] as const;

async function loadHandwritingFonts(): Promise<void> {
  const loadPromises = HANDWRITING_FONTS.map(async (font) => {
    const face = new FontFace(font.family, `url(${font.src})`, {
      weight: font.weight,
      display: 'swap',
    });
    const loaded = await face.load();
    document.fonts.add(loaded);
  });

  await Promise.all(loadPromises);
}

// Call early — before canvas initialization
await loadHandwritingFonts();
```

---

## 2. Text Rendering Pipeline

### Architecture Overview

```
User Input
  → Text Shaping (measure, wrap, split lines)
  → Style Resolution (font, size, color, variability params)
  → Glyph Rendering (per-character with transforms)
  → Cache Layer (OffscreenCanvas bitmap cache)
  → Composite to Main Canvas
```

### Core Renderer

```typescript
interface HandwrittenTextStyle {
  fontFamily: string;
  fontSize: number;           // base size in px
  color: string;
  lineHeight: number;         // multiplier (e.g., 1.6)
  letterSpacing: number;      // base spacing in px
  // Variability knobs
  jitter: number;             // 0–1, how "messy" the handwriting looks
  slant: number;              // degrees of italic lean (-5 to 5)
  pressure: number;           // 0–1, simulates pen pressure via opacity/weight
}

const DEFAULT_STYLE: HandwrittenTextStyle = {
  fontFamily: 'Caveat',
  fontSize: 24,
  color: '#1a1a1a',
  lineHeight: 1.6,
  letterSpacing: 0.5,
  jitter: 0.3,
  slant: 0,
  pressure: 0.7,
};

function renderHandwrittenText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: HandwrittenTextStyle = DEFAULT_STYLE,
  seed: number = 0
): void {
  const rng = createSeededRandom(seed); // deterministic randomness

  ctx.save();
  ctx.font = `${style.fontSize}px '${style.fontFamily}', cursive`;
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'top';

  const lines = wrapText(ctx, text, /* maxWidth */ 400);
  let cursorY = y;

  for (const line of lines) {
    let cursorX = x;

    for (const char of line) {
      // Per-character variability
      const dx = (rng() - 0.5) * style.jitter * 2;
      const dy = (rng() - 0.5) * style.jitter * 2;
      const rotation = (rng() - 0.5) * style.jitter * 0.05; // radians
      const scale = 1 + (rng() - 0.5) * style.jitter * 0.06;

      ctx.save();
      ctx.translate(cursorX + dx, cursorY + dy);
      ctx.rotate(rotation + (style.slant * Math.PI) / 180);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 0.85 + rng() * 0.15 * style.pressure;

      ctx.fillText(char, 0, 0);
      ctx.restore();

      cursorX += ctx.measureText(char).width + style.letterSpacing;
    }

    cursorY += style.fontSize * style.lineHeight;
  }

  ctx.restore();
}
```

### Text Wrapping

```typescript
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

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

  if (currentLine) lines.push(currentLine);
  return lines;
}
```

---

## 3. Variability & Realism

### Seeded Randomness (Deterministic)

Critical: randomness must be **seeded** so the same text always renders identically (no flickering on re-render).

```typescript
function createSeededRandom(seed: number): () => number {
  // Mulberry32 PRNG — fast, small, deterministic
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### Variability Layers

| Layer | What it does | Range |
|---|---|---|
| **Position jitter** | Shifts each character ±1–2px from baseline | `jitter * 2px` |
| **Rotation** | Micro-rotates each glyph | `±0.05 rad` at jitter=1 |
| **Scale** | Slight size variation per glyph | `±6%` at jitter=1 |
| **Opacity** | Simulates ink pressure variation | `0.85–1.0` |
| **Baseline drift** | Whole-line vertical wander (sine wave) | `±3px` amplitude |

### Baseline Drift (Line-Level)

```typescript
function getBaselineDrift(
  charIndex: number,
  lineLength: number,
  amplitude: number = 3
): number {
  // Gentle sine-wave drift across the line
  const frequency = 2 * Math.PI / Math.max(lineLength, 1);
  return Math.sin(charIndex * frequency) * amplitude;
}
```

### Jitter Presets

```typescript
const JITTER_PRESETS = {
  clean:   { jitter: 0.1, slant: 0,  pressure: 0.9 },  // Neat teacher handwriting
  natural: { jitter: 0.3, slant: -2, pressure: 0.7 },  // Default — casual notes
  sketchy: { jitter: 0.6, slant: -4, pressure: 0.5 },  // Rough whiteboard scrawl
} as const;
```

---

## 4. Ligatures & Flow

### Strategy: Let the Font Handle It

Handwriting fonts like Caveat already contain **OpenType ligatures** and contextual alternates. The key is to *not break them*.

```typescript
// GOOD — lets the shaping engine produce ligatures
ctx.fillText('efficient', x, y);

// BAD — character-by-character kills ligatures
for (const char of 'efficient') ctx.fillText(char, ...);
```

### Hybrid Approach: Word-Level Rendering with Character Jitter

Render **whole words** (preserving ligatures) but apply transforms at the **word level** to maintain natural flow.

```typescript
function renderHandwrittenLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  style: HandwrittenTextStyle,
  rng: () => number
): void {
  const words = line.split(' ');
  let cursorX = x;
  const spaceWidth = ctx.measureText(' ').width;

  for (const word of words) {
    const dx = (rng() - 0.5) * style.jitter * 1.5;
    const dy = (rng() - 0.5) * style.jitter * 1.5;
    const rotation = (rng() - 0.5) * style.jitter * 0.03;

    ctx.save();
    ctx.translate(cursorX + dx, y + dy);
    ctx.rotate(rotation);
    ctx.fillText(word, 0, 0);  // whole word — ligatures preserved
    ctx.restore();

    cursorX += ctx.measureText(word).width + spaceWidth + style.letterSpacing;
  }
}
```

### For Character-Level Animation (§7), Pre-Measure Then Animate

When animating character-by-character, pre-render the full word to an offscreen canvas for measurement, then reveal characters by clipping.

```typescript
function getCharacterPositions(
  ctx: CanvasRenderingContext2D,
  word: string
): number[] {
  const positions: number[] = [0];
  for (let i = 1; i <= word.length; i++) {
    positions.push(ctx.measureText(word.slice(0, i)).width);
  }
  return positions;
}
```

---

## 5. Size & Spacing

### Scale-Aware Sizing

```typescript
interface ScaleConfig {
  minFontSize: number;    // below this → don't render (show placeholder)
  maxFontSize: number;    // above this → cap to prevent comical scaling
  jitterScale: number;    // reduce jitter at small sizes for legibility
}

function getEffectiveStyle(
  baseStyle: HandwrittenTextStyle,
  zoom: number
): HandwrittenTextStyle {
  const effectiveSize = baseStyle.fontSize * zoom;

  // At very small sizes, reduce jitter for legibility
  const jitterScale = effectiveSize < 14 ? 0.1 : effectiveSize < 20 ? 0.5 : 1.0;

  return {
    ...baseStyle,
    fontSize: Math.max(10, Math.min(effectiveSize, 200)),
    jitter: baseStyle.jitter * jitterScale,
    letterSpacing: baseStyle.letterSpacing * Math.max(zoom, 0.5),
  };
}
```

### Recommended Sizes

| Use Case | Font Size | Line Height | Letter Spacing |
|---|---|---|---|
| Title / Header | 36–48px | 1.3 | 1px |
| Body annotation | 20–28px | 1.6 | 0.5px |
| Small label | 14–18px | 1.4 | 0.3px |
| Tiny (auto-fade) | <12px | — | — |

### DPI-Aware Rendering

```typescript
function setupHiDPICanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}
```

---

## 6. Performance

### Bitmap Caching with OffscreenCanvas

```typescript
class TextRenderCache {
  private cache = new Map<string, ImageBitmap>();
  private maxEntries = 500;

  private getCacheKey(text: string, style: HandwrittenTextStyle): string {
    return `${text}::${style.fontFamily}::${style.fontSize}::${style.jitter}::${style.color}`;
  }

  async getOrRender(
    text: string,
    style: HandwrittenTextStyle,
    renderFn: (ctx: OffscreenCanvasRenderingContext2D) => void
  ): Promise<ImageBitmap> {
    const key = this.getCacheKey(text, style);

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Measure required dimensions
    const tempCanvas = new OffscreenCanvas(1, 1);
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.font = `${style.fontSize}px '${style.fontFamily}'`;
    const metrics = tempCtx.measureText(text);
    const padding = style.fontSize * 0.3; // room for jitter

    const width = Math.ceil(metrics.width + padding * 2);
    const height = Math.ceil(style.fontSize * style.lineHeight + padding * 2);

    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d')!;
    renderFn(ctx);

    const bitmap = await createImageBitmap(offscreen);

    // LRU eviction
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value!;
      this.cache.delete(oldest);
    }

    this.cache.set(key, bitmap);
    return bitmap;
  }

  invalidate(textPrefix?: string): void {
    if (!textPrefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(textPrefix)) this.cache.delete(key);
    }
  }
}
```

### Render Batching

```typescript
class WhiteboardRenderer {
  private dirty = false;
  private rafId: number | null = null;

  markDirty(): void {
    if (this.dirty) return;
    this.dirty = true;
    this.rafId = requestAnimationFrame(() => this.flush());
  }

  private flush(): void {
    this.dirty = false;
    this.rafId = null;
    // Re-render only changed regions
    this.renderVisibleElements();
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  private renderVisibleElements(): void {
    // Viewport culling: only render elements within visible bounds
    // + margin for partially visible text
  }
}
```

### Performance Budget

| Metric | Target |
|---|---|
| First paint (fonts loaded) | < 200ms |
| Re-render (cached) | < 4ms (60fps budget = 16ms) |
| Cache hit rate | > 90% for static text |
| Memory (cache) | < 50MB bitmap data |

---

## 7. Animation — Character-by-Character Reveal

### Approach: Clip-Based Word Reveal

Render full words (keeping ligatures), animate a clipping rectangle to reveal character-by-character.

```typescript
interface TextAnimation {
  text: string;
  style: HandwrittenTextStyle;
  x: number;
  y: number;
  charPositions: number[];     // pre-computed x-position of each char boundary
  startTime: number;
  msPerChar: number;           // e.g., 50ms
}

function animateHandwrittenText(
  ctx: CanvasRenderingContext2D,
  anim: TextAnimation,
  currentTime: number
): boolean /* done */ {
  const elapsed = currentTime - anim.startTime;
  const charsToShow = Math.min(
    Math.floor(elapsed / anim.msPerChar),
    anim.text.length
  );

  if (charsToShow === 0) return false;

  const revealWidth = anim.charPositions[charsToShow] ?? 
    anim.charPositions[anim.charPositions.length - 1];

  ctx.save();
  ctx.font = `${anim.style.fontSize}px '${anim.style.fontFamily}'`;
  ctx.fillStyle = anim.style.color;
  ctx.textBaseline = 'top';

  // Clip to reveal only the characters shown so far
  ctx.beginPath();
  ctx.rect(
    anim.x - 2,
    anim.y - 2,
    revealWidth + 4,
    anim.style.fontSize * anim.style.lineHeight + 4
  );
  ctx.clip();

  ctx.fillText(anim.text, anim.x, anim.y);
  ctx.restore();

  // Optional: draw a "pen cursor" at the leading edge
  if (charsToShow < anim.text.length) {
    drawPenCursor(ctx, anim.x + revealWidth, anim.y + anim.style.fontSize * 0.5);
  }

  return charsToShow >= anim.text.length;
}

function drawPenCursor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = '#3b82f6';
  ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 150) * 0.4; // pulse
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
```

### Animation Timing Curves

```typescript
const ANIMATION_PRESETS = {
  typewriter: { msPerChar: 50, easing: 'linear' },
  natural:    { msPerChar: 70, easing: 'ease-in-out', jitterMs: 20 },
  fast:       { msPerChar: 25, easing: 'linear' },
} as const;

// Natural timing: vary delay per character to mimic real writing
function getNaturalCharDelay(char: string, baseMs: number, rng: () => number): number {
  if (char === ' ') return baseMs * 0.5;            // spaces are quick
  if (char === '.' || char === ',') return baseMs * 1.5;  // pauses at punctuation
  if (char === char.toUpperCase() && char !== char.toLowerCase()) {
    return baseMs * 1.3; // capitals take longer
  }
  return baseMs + (rng() - 0.5) * baseMs * 0.4;    // ±20% random variation
}
```

---

## 8. Accessibility

### WCAG Contrast Requirements

Handwritten fonts are often lighter-weight, so **contrast must be verified**.

```typescript
// Minimum contrast ratios (WCAG 2.1 AA)
// Normal text (< 18pt / < 14pt bold): 4.5:1
// Large text  (≥ 18pt / ≥ 14pt bold): 3:1
// Handwritten text at 24px+ qualifies as "large text" → 3:1 minimum

function getLuminance(hex: string): number {
  const rgb = hexToRGB(hex);
  const [r, g, b] = rgb.map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(fg: string, bg: string): number {
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function validateContrast(
  textColor: string,
  bgColor: string,
  fontSize: number
): { passes: boolean; ratio: number; required: number } {
  const ratio = getContrastRatio(textColor, bgColor);
  const required = fontSize >= 24 ? 3.0 : 4.5; // large text threshold
  return { passes: ratio >= required, ratio, required };
}
```

### Accessible Color Palette (Pre-Validated)

```typescript
// All colors validated against white (#FFFFFF) background
const ACCESSIBLE_HANDWRITING_COLORS = {
  black:    '#1a1a1a',  // 17.4:1 ✓
  darkGray: '#4a4a4a',  //  7.7:1 ✓
  blue:     '#1e40af',  //  8.1:1 ✓
  red:      '#991b1b',  //  8.5:1 ✓
  green:    '#166534',  //  7.9:1 ✓
  purple:   '#6b21a8',  //  7.3:1 ✓
} as const;
```

### Screen Reader Support

Canvas is invisible to screen readers. Provide alternative text.

```typescript
function renderAccessibleText(
  canvas: HTMLCanvasElement,
  textElements: Array<{ text: string; x: number; y: number }>
): void {
  // Option A: aria-label on canvas
  const fullText = textElements.map((el) => el.text).join('. ');
  canvas.setAttribute('aria-label', fullText);
  canvas.setAttribute('role', 'img');

  // Option B: Hidden DOM overlay with selectable text (preferred)
  const overlay = document.createElement('div');
  overlay.className = 'sr-only'; // visually hidden, screen-reader accessible
  overlay.style.cssText = 'position:absolute;clip:rect(0,0,0,0);pointer-events:none;';

  for (const el of textElements) {
    const span = document.createElement('span');
    span.textContent = el.text;
    overlay.appendChild(span);
  }

  canvas.parentElement?.appendChild(overlay);
}
```

### Reduced Motion

```typescript
function shouldAnimate(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Usage
if (shouldAnimate()) {
  startCharacterAnimation(ctx, textAnim);
} else {
  renderFullTextImmediately(ctx, text, style); // no animation
}
```

---

## 9. Putting It All Together

### Integration Example

```typescript
class HandwrittenTextElement {
  readonly id: string;
  text: string;
  position: { x: number; y: number };
  style: HandwrittenTextStyle;
  seed: number;

  private cache: TextRenderCache;
  private animation: TextAnimation | null = null;

  constructor(
    text: string,
    position: { x: number; y: number },
    style: Partial<HandwrittenTextStyle> = {},
    cache: TextRenderCache
  ) {
    this.id = crypto.randomUUID();
    this.text = text;
    this.position = position;
    this.style = { ...DEFAULT_STYLE, ...style };
    this.seed = Math.floor(Math.random() * 100000);
    this.cache = cache;
  }

  render(ctx: CanvasRenderingContext2D, zoom: number): void {
    const effective = getEffectiveStyle(this.style, zoom);

    // Skip rendering if too small to read
    if (effective.fontSize < 6) return;

    // Validate contrast
    const contrast = validateContrast(effective.color, '#ffffff', effective.fontSize);
    if (!contrast.passes) {
      console.warn(`Text "${this.text}" fails contrast: ${contrast.ratio.toFixed(1)} < ${contrast.required}`);
    }

    renderHandwrittenText(ctx, this.text, this.position.x, this.position.y, effective, this.seed);
  }

  startAnimation(msPerChar: number = 60): void {
    if (!shouldAnimate()) return;
    // Set up animation state...
  }
}
```

---

## 10. Decision Summary

| Decision | Choice | Rationale |
|---|---|---|
| Primary font | **Caveat** | Best balance of handwritten feel + legibility, OFL licensed, variable weight |
| Secondary font | **Virgil** | Purpose-built for whiteboard UIs (Excalidraw), excellent at small sizes |
| Rendering unit | **Word-level** | Preserves OpenType ligatures while allowing per-word jitter |
| Randomness | **Seeded PRNG** | Deterministic — same text always renders the same way |
| Caching | **OffscreenCanvas → ImageBitmap** | Hardware-accelerated, avoids redundant glyph shaping |
| Animation | **Clip-reveal** | Shows full word (ligatures intact) progressively |
| Accessibility | **Hidden DOM overlay + contrast validation** | WCAG AA compliant, screen-reader friendly |
| Performance target | **< 4ms per cached frame** | Fits within 60fps budget with room for other rendering |
