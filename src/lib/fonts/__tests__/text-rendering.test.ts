/**
 * Tests for handwritten text rendering system.
 *
 * Covers: font loading, word wrap, jitter determinism, accessibility overlay.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderText,
  renderHandwrittenText,
  wrapText,
  createSeededRandom,
  hashText,
  getCharacterPositions,
  renderAccessibleOverlay,
} from '@/lib/renderer/shape-renderers/text';
import { FontManager } from '@/lib/fonts/FontManager';

// ── Mock canvas context ──────────────────────────────────────

function createMockCtx(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = [];

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop === 'calls') return calls;
      if (prop === 'canvas') return { width: 800, height: 600 };
      if (typeof target[prop] === 'function') return target[prop];
      return target[prop] ?? '';
    },
    set(target, prop: string, value) {
      calls.push(`set:${prop}=${String(value)}`);
      target[prop] = value;
      return true;
    },
  };

  const methods = [
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc',
    'fill', 'stroke', 'save', 'restore',
    'translate', 'rotate', 'scale', 'setTransform',
    'clearRect', 'fillRect', 'fillText', 'clip', 'rect',
    'setLineDash',
  ];

  const target: Record<string, unknown> = {
    measureText: (text: string) => {
      calls.push(`measureText:${text}`);
      return {
        width: text.length * 8,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 3,
      };
    },
  };

  for (const m of methods) {
    target[m] = (...args: unknown[]) => {
      calls.push(`${m}(${args.map(String).join(',')})`);
    };
  }

  return new Proxy(target, handler) as unknown as CanvasRenderingContext2D & {
    calls: string[];
  };
}

// ── FontManager tests ────────────────────────────────────────

describe('FontManager', () => {
  beforeEach(() => {
    FontManager.resetInstance();
  });

  it('returns singleton instance', () => {
    const a = FontManager.getInstance();
    const b = FontManager.getInstance();
    expect(a).toBe(b);
  });

  it('reports no fonts loaded initially', () => {
    const fm = FontManager.getInstance();
    expect(fm.isFontLoaded('Caveat')).toBe(false);
    expect(fm.isFontLoaded('Virgil')).toBe(false);
  });

  it('returns fallback font family when no fonts loaded', () => {
    const fm = FontManager.getInstance();
    expect(fm.getActiveFontFamily()).toBe("'Inter', sans-serif");
  });

  it('getLoadedFamilies returns empty array initially', () => {
    const fm = FontManager.getInstance();
    expect(fm.getLoadedFamilies()).toEqual([]);
  });

  it('preload is idempotent (returns same promise)', async () => {
    const fm = FontManager.getInstance();

    // Mock FontFace as a constructor function
    function MockFontFace() {
      return {
        load: () => Promise.reject(new Error('No fonts in test env')),
      };
    }
    vi.stubGlobal('FontFace', MockFontFace);

    const p1 = fm.preload();
    const p2 = fm.preload();
    expect(p1).toBe(p2);

    // Should resolve without throwing (failures are logged as warnings)
    await expect(p1).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });
});

// ── Seeded PRNG tests ────────────────────────────────────────

describe('createSeededRandom', () => {
  it('produces values between 0 and 1', () => {
    const rng = createSeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('is deterministic — same seed produces same sequence', () => {
    const rng1 = createSeededRandom(12345);
    const rng2 = createSeededRandom(12345);

    const seq1 = Array.from({ length: 20 }, () => rng1());
    const seq2 = Array.from({ length: 20 }, () => rng2());

    expect(seq1).toEqual(seq2);
  });

  it('different seeds produce different sequences', () => {
    const rng1 = createSeededRandom(1);
    const rng2 = createSeededRandom(2);

    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());

    expect(seq1).not.toEqual(seq2);
  });
});

describe('hashText', () => {
  it('returns same hash for same text', () => {
    expect(hashText('hello')).toBe(hashText('hello'));
  });

  it('returns different hash for different text', () => {
    expect(hashText('hello')).not.toBe(hashText('world'));
  });
});

// ── Word wrap tests ──────────────────────────────────────────

describe('wrapText', () => {
  it('does not wrap short text', () => {
    const ctx = createMockCtx();
    ctx.font = '16px sans-serif';
    const lines = wrapText(ctx, 'Hello', 500);
    expect(lines).toEqual(['Hello']);
  });

  it('wraps text that exceeds maxWidth', () => {
    const ctx = createMockCtx();
    // Each character = 8px, so "Hello World" = 88px
    const lines = wrapText(ctx, 'Hello World', 60);
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('Hello');
    expect(lines[1]).toBe('World');
  });

  it('preserves explicit newlines', () => {
    const ctx = createMockCtx();
    const lines = wrapText(ctx, 'Line1\nLine2', 500);
    expect(lines).toEqual(['Line1', 'Line2']);
  });

  it('handles empty string', () => {
    const ctx = createMockCtx();
    const lines = wrapText(ctx, '', 500);
    expect(lines).toEqual(['']);
  });

  it('wraps multiple words correctly', () => {
    const ctx = createMockCtx();
    // "A B C D E" — each word is short but total is long
    const lines = wrapText(ctx, 'alpha beta gamma delta', 80);
    expect(lines.length).toBeGreaterThan(1);
  });
});

// ── Jitter determinism tests ─────────────────────────────────

describe('Handwritten jitter determinism', () => {
  it('renderHandwrittenText produces identical calls for same seed', () => {
    const ctx1 = createMockCtx();
    const ctx2 = createMockCtx();

    renderHandwrittenText(ctx1, 'Hello World', 10, 20, 200, undefined, 42);
    renderHandwrittenText(ctx2, 'Hello World', 10, 20, 200, undefined, 42);

    expect(ctx1.calls).toEqual(ctx2.calls);
  });

  it('different seeds produce different transform calls', () => {
    const ctx1 = createMockCtx();
    const ctx2 = createMockCtx();

    renderHandwrittenText(ctx1, 'Hello World', 10, 20, 200, undefined, 1);
    renderHandwrittenText(ctx2, 'Hello World', 10, 20, 200, undefined, 2);

    // The translate/rotate/scale calls should differ
    const translates1 = ctx1.calls.filter((c) => c.startsWith('translate('));
    const translates2 = ctx2.calls.filter((c) => c.startsWith('translate('));
    expect(translates1).not.toEqual(translates2);
  });

  it('same text always gets same hash seed', () => {
    const ctx1 = createMockCtx();
    const ctx2 = createMockCtx();

    // No explicit seed — uses hashText internally
    renderHandwrittenText(ctx1, 'Deterministic', 0, 0, 300);
    renderHandwrittenText(ctx2, 'Deterministic', 0, 0, 300);

    expect(ctx1.calls).toEqual(ctx2.calls);
  });
});

// ── Character positions (for animation) ──────────────────────

describe('getCharacterPositions', () => {
  it('returns positions array starting at 0', () => {
    const ctx = createMockCtx();
    ctx.font = '16px sans-serif';
    const positions = getCharacterPositions(ctx, 'Hi');
    expect(positions[0]).toBe(0);
    expect(positions.length).toBe(3); // 0, after H, after Hi
  });

  it('positions are monotonically increasing', () => {
    const ctx = createMockCtx();
    const positions = getCharacterPositions(ctx, 'Hello');
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    }
  });
});

// ── Legibility constraints ───────────────────────────────────

describe('Legibility at low zoom', () => {
  it('shows placeholder bars below 8px effective size', () => {
    const ctx = createMockCtx();
    // fontSize=24, zoom=0.3 => effective=7.2 < 8 => placeholder
    renderHandwrittenText(ctx, 'Tiny text', 0, 0, 200, undefined, 1, 0.3);

    const fillRects = ctx.calls.filter((c) => c.startsWith('fillRect('));
    expect(fillRects.length).toBeGreaterThan(0);
    // Should NOT have fillText calls
    const fillTexts = ctx.calls.filter((c) => c.startsWith('fillText('));
    expect(fillTexts.length).toBe(0);
  });

  it('bumps font weight at low zoom (<12px effective)', () => {
    const ctx = createMockCtx();
    // fontSize=24, zoom=0.45 => effective=10.8 < 12 => weight 600
    renderHandwrittenText(ctx, 'Small text', 0, 0, 200, undefined, 1, 0.45);

    const fontSets = ctx.calls.filter((c) => c.startsWith('set:font='));
    expect(fontSets.some((c) => c.includes('600'))).toBe(true);
  });

  it('enforces minimum font size of 11px', () => {
    const ctx = createMockCtx();
    const style = {
      fontFamily: 'sans-serif',
      fontSize: 8,
      color: '#000',
      lineHeight: 1.6,
      letterSpacing: 0.5,
      jitter: 0.3,
      slant: 0,
      pressure: 0.7,
    };
    renderHandwrittenText(ctx, 'Test', 0, 0, 200, style, 1, 1);

    const fontSets = ctx.calls.filter((c) => c.startsWith('set:font='));
    // Font should contain 11 (min), not 8
    expect(fontSets.some((c) => c.includes('11px'))).toBe(true);
  });
});

// ── renderText backward compatibility ────────────────────────

describe('renderText (original)', () => {
  it('still works with TextElement unchanged', () => {
    const ctx = createMockCtx();
    const el = {
      id: 'test',
      type: 'text' as const,
      x: 10,
      y: 20,
      w: 200,
      h: 50,
      rotation: 0,
      opacity: 1,
      locked: false,
      createdAt: 0,
      updatedAt: 0,
      content: 'Hello',
      style: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 400 as const,
        lineHeight: 1.4,
        letterSpacing: 0,
        color: '#000000' as `#${string}`,
        align: 'left' as const,
      },
    };

    renderText(ctx, el);
    const fillCalls = ctx.calls.filter((c) => c.startsWith('fillText'));
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);
    expect(fillCalls[0]).toContain('Hello');
  });
});

// ── Accessibility overlay ────────────────────────────────────

describe('renderAccessibleOverlay', () => {
  it('creates sr-only overlay with text spans', () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const overlay = renderAccessibleOverlay(canvas, [
      { text: 'Hello', x: 0, y: 0 },
      { text: 'World', x: 100, y: 0 },
    ]);

    expect(overlay.className).toBe('sr-only');
    expect(overlay.getAttribute('role')).toBe('region');
    expect(overlay.children.length).toBe(2);
    expect(overlay.children[0].textContent).toBe('Hello');
    expect(overlay.children[1].textContent).toBe('World');
    // Should be appended to canvas parent
    expect(container.contains(overlay)).toBe(true);
  });

  it('sets pointer-events to none', () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const overlay = renderAccessibleOverlay(canvas, [
      { text: 'Test', x: 0, y: 0 },
    ]);

    expect(overlay.style.pointerEvents).toBe('none');
  });
});
