'use client';

import { useCallback, useRef } from 'react';
import {
  createSeededRandom,
  hashText,
  getCharacterPositions,
} from '@/lib/renderer/shape-renderers/text';
import { FONT_FALLBACK_CHAIN } from '@/lib/fonts/FontManager';

// ── Types ───────────────────────────────────────────────────

export interface HandwrittenAnimationConfig {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  maxWidth: number;
  /** Base ms per character (default 60). */
  msPerChar?: number;
  /** Seed for deterministic jitter (default: hash of text). */
  seed?: number;
  onComplete?: () => void;
}

interface AnimationState {
  config: HandwrittenAnimationConfig;
  charPositions: number[];
  charTimings: number[];   // cumulative timing per character
  startTime: number;
  rafId: number | null;
  done: boolean;
}

// ── Natural timing ──────────────────────────────────────────

/**
 * Compute natural per-character delay:
 * - Spaces: 0.05s (50ms)
 * - Punctuation (.!?,;:): 0.1–0.3s pause
 * - Regular chars: baseMs ± 20% random variation
 */
function getNaturalCharDelay(
  char: string,
  baseMs: number,
  rng: () => number,
): number {
  if (char === ' ') return 50;
  if ('.!?'.includes(char)) return 100 + rng() * 200;   // 0.1–0.3s
  if (',;:'.includes(char)) return 100 + rng() * 100;   // 0.1–0.2s
  if (char === char.toUpperCase() && char !== char.toLowerCase()) {
    return baseMs * 1.3;
  }
  return baseMs + (rng() - 0.5) * baseMs * 0.4;
}

/** Build cumulative timing array for each character. */
function buildCharTimings(text: string, baseMs: number, seed: number): number[] {
  const rng = createSeededRandom(seed);
  const timings: number[] = [0];
  let cumulative = 0;

  for (const char of text) {
    cumulative += getNaturalCharDelay(char, baseMs, rng);
    timings.push(cumulative);
  }
  return timings;
}

// ── Pen cursor ──────────────────────────────────────────────

function drawPenCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
): void {
  ctx.save();
  ctx.fillStyle = '#3b82f6';
  ctx.globalAlpha = 0.6 + Math.sin(time / 150) * 0.4;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Hook ────────────────────────────────────────────────────

/**
 * Animate text character-by-character with clip-reveal technique.
 *
 * Renders full words to preserve ligatures, then uses a clipping rect
 * to progressively reveal characters. Natural timing pauses at
 * punctuation and speeds through spaces.
 *
 * Performance target: <4ms per frame.
 */
export function useHandwrittenAnimation() {
  const stateRef = useRef<AnimationState | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const start = useCallback(
    (ctx: CanvasRenderingContext2D, config: HandwrittenAnimationConfig) => {
      // Cancel any existing animation
      if (stateRef.current?.rafId != null) {
        cancelAnimationFrame(stateRef.current.rafId);
      }

      ctxRef.current = ctx;
      const seed = config.seed ?? hashText(config.text);
      const baseMs = config.msPerChar ?? 60;

      // Pre-measure character positions for clip boundary
      ctx.font = `${config.fontSize}px ${FONT_FALLBACK_CHAIN}`;
      const charPositions = getCharacterPositions(ctx, config.text);
      const charTimings = buildCharTimings(config.text, baseMs, seed);

      const state: AnimationState = {
        config,
        charPositions,
        charTimings,
        startTime: performance.now(),
        rafId: null,
        done: false,
      };
      stateRef.current = state;

      const tick = (now: number) => {
        if (state.done) return;
        renderFrame(ctx, state, now);

        if (!state.done) {
          state.rafId = requestAnimationFrame(tick);
        }
      };

      state.rafId = requestAnimationFrame(tick);
    },
    [],
  );

  const stop = useCallback(() => {
    const state = stateRef.current;
    if (state?.rafId != null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
      state.done = true;
    }
  }, []);

  const isAnimating = useCallback(() => {
    return stateRef.current != null && !stateRef.current.done;
  }, []);

  return { start, stop, isAnimating } as const;
}

// ── Frame renderer ──────────────────────────────────────────

function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: AnimationState,
  now: number,
): void {
  const { config, charPositions, charTimings } = state;
  const elapsed = now - state.startTime;

  // Determine how many characters to show based on natural timing
  let charsToShow = 0;
  for (let i = 1; i < charTimings.length; i++) {
    const timing = charTimings[i];
    if (timing !== undefined && elapsed >= timing) {
      charsToShow = i;
    } else {
      break;
    }
  }

  if (charsToShow === 0) return;

  const revealWidth =
    charPositions[charsToShow] ??
    charPositions[charPositions.length - 1] ??
    0;

  ctx.save();
  ctx.font = `${config.fontSize}px ${FONT_FALLBACK_CHAIN}`;
  ctx.fillStyle = config.color;
  ctx.textBaseline = 'top';

  // Clip to reveal only characters shown so far — preserves ligatures
  ctx.beginPath();
  ctx.rect(
    config.x - 2,
    config.y - 2,
    revealWidth + 4,
    config.fontSize * 1.6 + 4,
  );
  ctx.clip();
  ctx.fillText(config.text, config.x, config.y);
  ctx.restore();

  // Draw pen cursor at leading edge
  if (charsToShow < config.text.length) {
    drawPenCursor(ctx, config.x + revealWidth, config.y + config.fontSize * 0.5, now);
  }

  // Done?
  if (charsToShow >= config.text.length) {
    state.done = true;
    state.rafId = null;
    config.onComplete?.();
  }
}

export default useHandwrittenAnimation;
