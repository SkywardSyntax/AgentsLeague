import type { TextElement } from '@/types/drawing';
import { FONT_FALLBACK_CHAIN } from '@/lib/fonts/FontManager';

// ── Seeded PRNG (Mulberry32) ────────────────────────────────

/** Create a deterministic PRNG from a numeric seed. */
export function createSeededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple string hash for deterministic seeds. */
export function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash;
}

// ── Handwritten text style ──────────────────────────────────

export interface HandwrittenTextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  lineHeight: number;
  letterSpacing: number;
  jitter: number;       // 0–1
  slant: number;        // degrees
  pressure: number;     // 0–1
}

export const DEFAULT_HANDWRITTEN_STYLE: HandwrittenTextStyle = {
  fontFamily: FONT_FALLBACK_CHAIN,
  fontSize: 24,
  color: '#1a1a1a',
  lineHeight: 1.6,
  letterSpacing: 0.5,
  jitter: 0.3,
  slant: 0,
  pressure: 0.7,
};

// ── Legibility constants ────────────────────────────────────

const MIN_FONT_SIZE = 11;
const PLACEHOLDER_THRESHOLD = 8;
const LOW_ZOOM_WEIGHT_THRESHOLD = 12;

// ── Original renderText (unchanged API) ─────────────────────

export function renderText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
): void {
  const { x, y, w, content, style } = el;

  const font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
  ctx.font = font;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  ctx.textBaseline = 'top';

  const lineHeight = style.lineHeight * style.fontSize;
  const lines = wrapText(ctx, content, w);

  let yOffset = y;
  for (const line of lines) {
    let xPos = x;
    if (style.align === 'center') {
      xPos = x + w / 2;
    } else if (style.align === 'right') {
      xPos = x + w;
    }
    ctx.fillText(line, xPos, yOffset);
    yOffset += lineHeight;
  }
}

// ── Handwritten text renderer ───────────────────────────────

/**
 * Render text with handwritten jitter at the word level.
 * Preserves OpenType ligatures by rendering whole words.
 *
 * Jitter formula (seeded PRNG, seed = textHash + wordIndex):
 *   x' = x + (rand() - 0.5) * 4
 *   rotation = (rand() - 0.5) * 1°
 *   scale = 1 + (rand() - 0.5) * 0.04
 *   opacity = max(0.8, 1 + (rand() - 0.5) * 0.2)
 */
export function renderHandwrittenText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  style: HandwrittenTextStyle = DEFAULT_HANDWRITTEN_STYLE,
  seed?: number,
  zoom = 1,
): void {
  const effectiveSize = style.fontSize * zoom;

  // Below 8px: show placeholder bars instead of text
  if (effectiveSize < PLACEHOLDER_THRESHOLD) {
    renderPlaceholderBars(ctx, x, y, maxWidth, style);
    return;
  }

  const resolvedStyle = resolveStyleForZoom(style, zoom);
  const rng = createSeededRandom(seed ?? hashText(text));

  const fontWeight = effectiveSize < LOW_ZOOM_WEIGHT_THRESHOLD ? 600 : (resolvedStyle.pressure >= 0.7 ? 500 : 400);
  ctx.font = `${fontWeight} ${Math.max(MIN_FONT_SIZE, resolvedStyle.fontSize)}px ${resolvedStyle.fontFamily}`;
  ctx.fillStyle = resolvedStyle.color;
  ctx.textBaseline = 'top';

  const lines = wrapText(ctx, text, maxWidth);
  const lineHeight = resolvedStyle.fontSize * resolvedStyle.lineHeight;
  let cursorY = y;

  for (const line of lines) {
    renderHandwrittenLine(ctx, line, x, cursorY, resolvedStyle, rng);
    cursorY += lineHeight;
  }
}

/** Render a single line with per-word jitter, preserving ligatures. */
function renderHandwrittenLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  style: HandwrittenTextStyle,
  rng: () => number,
): void {
  const words = line.split(' ');
  let cursorX = x;
  const spaceWidth = ctx.measureText(' ').width;

  for (const word of words) {
    // Word-level jitter: position ±2px, rotation ±0.5°, scale ±0.02, opacity ±0.1
    const dx = (rng() - 0.5) * 4 * style.jitter;
    const dy = (rng() - 0.5) * 4 * style.jitter;
    const rotation = ((rng() - 0.5) * 1 * style.jitter * Math.PI) / 180;
    const scale = 1 + (rng() - 0.5) * 0.04 * style.jitter;
    const opacity = Math.max(0.8, 1 + (rng() - 0.5) * 0.2 * style.jitter);

    ctx.save();
    ctx.translate(cursorX + dx, y + dy);
    ctx.rotate(rotation + (style.slant * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.globalAlpha = opacity;
    ctx.fillText(word, 0, 0);
    ctx.restore();

    cursorX += ctx.measureText(word).width + spaceWidth + style.letterSpacing;
  }
}

/** Render gray placeholder bars when text is too small to read. */
function renderPlaceholderBars(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  maxWidth: number,
  style: HandwrittenTextStyle,
): void {
  ctx.save();
  ctx.fillStyle = '#d1d5db';
  const barHeight = Math.max(2, style.fontSize * 0.3);
  const barGap = barHeight * 1.5;
  const barCount = 3;

  for (let i = 0; i < barCount; i++) {
    const w = maxWidth * (0.6 + Math.random() * 0.35);
    ctx.fillRect(x, y + i * (barHeight + barGap), w, barHeight);
  }
  ctx.restore();
}

/** Adjust style for current zoom level — reduce jitter at small sizes. */
function resolveStyleForZoom(
  style: HandwrittenTextStyle,
  zoom: number,
): HandwrittenTextStyle {
  const effectiveSize = style.fontSize * zoom;
  const jitterScale = effectiveSize < 14 ? 0.1 : effectiveSize < 20 ? 0.5 : 1.0;

  return {
    ...style,
    fontSize: Math.max(MIN_FONT_SIZE, style.fontSize),
    jitter: style.jitter * jitterScale,
    letterSpacing: style.letterSpacing * Math.max(zoom, 0.5),
  };
}

// ── Character positions (for animation) ─────────────────────

/** Pre-measure character boundary positions within a word (for clip-reveal). */
export function getCharacterPositions(
  ctx: CanvasRenderingContext2D,
  word: string,
): number[] {
  const positions: number[] = [0];
  for (let i = 1; i <= word.length; i++) {
    positions.push(ctx.measureText(word.slice(0, i)).width);
  }
  return positions;
}

// ── Word wrap ───────────────────────────────────────────────

/** Word-wrap text to fit within maxWidth. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
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
    lines.push(currentLine);
  }

  return lines;
}

// ── Accessibility overlay ───────────────────────────────────

/** Create a hidden DOM overlay for screen readers alongside canvas text. */
export function renderAccessibleOverlay(
  canvas: HTMLCanvasElement,
  textElements: { text: string; x: number; y: number }[],
): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'sr-only';
  overlay.setAttribute('role', 'region');
  overlay.setAttribute('aria-label', 'Canvas text content');
  overlay.style.cssText =
    'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);pointer-events:none;';

  for (const el of textElements) {
    const span = document.createElement('span');
    span.textContent = el.text;
    overlay.appendChild(span);
  }

  canvas.parentElement?.appendChild(overlay);
  return overlay;
}
