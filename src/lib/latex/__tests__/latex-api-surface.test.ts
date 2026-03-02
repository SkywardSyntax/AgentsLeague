import { describe, it, expect } from 'vitest';
import { normalizeTexForMathJax, prepareTexForMathJax } from '@/lib/latex/tex-normalize';
import { parseStreamingLatex } from '@/lib/latex/stream-tex-parser';
import type { ParsedSegment } from '@/lib/latex/stream-tex-parser';
import { createRenderProfiler } from '@/lib/latex/render-profiler';
import type { RenderProfiler } from '@/lib/latex/render-profiler';
import { createRenderDedup } from '@/lib/latex/render-dedup';
import { parseTextScripts } from '@/lib/latex/text-scripts';
import type { ScriptToken } from '@/lib/latex/text-scripts';
import { createLatexFallbackChain } from '@/lib/latex/render-fallback-chain';

describe('Lane 05 — LaTeX API Surface', () => {
  it('normalizeTexForMathJax is a function that accepts string', () => {
    expect(typeof normalizeTexForMathJax).toBe('function');
    const result = normalizeTexForMathJax('x^2');
    expect(typeof result).toBe('string');
  });

  it('prepareTexForMathJax returns { tex, displayMode }', () => {
    const result = prepareTexForMathJax('$$x^2$$');
    expect(Object.keys(result).sort()).toMatchInlineSnapshot(`
      [
        "displayMode",
        "tex",
      ]
    `);
    expect(typeof result.tex).toBe('string');
    expect(typeof result.displayMode).toBe('boolean');
  });

  it('parseStreamingLatex returns ParsedSegment array', () => {
    const result = parseStreamingLatex('hello $x^2$ world');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('ParsedSegment interface shape is stable (kind, value, display)', () => {
    const segment: ParsedSegment = { kind: 'latex', value: 'x^2', display: false };
    expect(Object.keys(segment).sort()).toMatchInlineSnapshot(`
      [
        "display",
        "kind",
        "value",
      ]
    `);
  });

  it('createRenderProfiler returns RenderProfiler with correct API', () => {
    const profiler = createRenderProfiler();
    expect(typeof profiler.startRender).toBe('function');
    expect(typeof profiler.recordCacheHit).toBe('function');
    expect(typeof profiler.recordError).toBe('function');
    expect(typeof profiler.setQueueDepth).toBe('function');
    expect(typeof profiler.snapshot).toBe('function');
    expect(typeof profiler.reset).toBe('function');
  });

  it('RenderProfiler.snapshot returns RenderProfileSnapshot shape', () => {
    const profiler = createRenderProfiler();
    const snap = profiler.snapshot();
    expect(Object.keys(snap).sort()).toMatchInlineSnapshot(`
      [
        "avgRenderMs",
        "cacheHitRate",
        "currentQueueDepth",
        "errorCount",
        "errorsByType",
        "p95RenderMs",
        "slowestExpression",
        "totalRenders",
      ]
    `);
  });

  it('createRenderDedup returns RenderDedup with correct API', () => {
    const dedup = createRenderDedup();
    expect(typeof dedup.render).toBe('function');
    expect(typeof dedup.pendingCount).toBe('function');
  });

  it('parseTextScripts returns ScriptToken array', () => {
    const tokens = parseTextScripts('H₂O');
    expect(Array.isArray(tokens)).toBe(true);
  });

  it('ScriptToken interface shape is stable', () => {
    const token: ScriptToken = { kind: 'text', value: 'H' };
    expect(Object.keys(token).sort()).toMatchInlineSnapshot(`
      [
        "kind",
        "value",
      ]
    `);
  });

  it('createLatexFallbackChain is a function', () => {
    expect(typeof createLatexFallbackChain).toBe('function');
  });
});
