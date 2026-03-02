import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const MATHJAX_PATH = '@/lib/latex/mathjax-client';

function mockMathJaxModules(mathjaxFactory: () => Record<string, unknown>) {
  vi.doMock('mathjax-full/js/mathjax.js', mathjaxFactory);
  vi.doMock('mathjax-full/js/input/tex.js', () => ({
    TeX: function TeX() { return {}; },
  }));
  vi.doMock('mathjax-full/js/output/svg.js', () => ({
    SVG: function SVG() { return {}; },
  }));
  vi.doMock('mathjax-full/js/adaptors/liteAdaptor.js', () => ({
    liteAdaptor: () => ({ outerHTML: () => '<svg>ok</svg>' }),
  }));
  vi.doMock('mathjax-full/js/handlers/html.js', () => ({ RegisterHTMLHandler: vi.fn() }));
  vi.doMock('mathjax-full/js/input/tex/AllPackages.js', () => ({ AllPackages: [] }));
}

describe('MathJax init error recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    // Mock fetch to return non-OK so the init error is preserved (not overwritten)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('clears cached promise on failure so next attempt can retry', async () => {
    mockMathJaxModules(() => { throw new Error('init failed'); });

    const mod = await import(MATHJAX_PATH);
    mod.clearRenderCache();
    mod.resetMathJaxInit();

    // First call fails
    await expect(mod.renderTexToSvg('x', false, 5000)).rejects.toThrow();

    // Reset modules so we can re-mock with success
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }));
    mockMathJaxModules(() => ({
      mathjax: { document: () => ({ convert: () => 'node' }) },
    }));

    const mod2 = await import(MATHJAX_PATH);
    mod2.clearRenderCache();
    // Fresh module has zero init attempts
    const result = await mod2.renderTexToSvg('x', false, 5000);
    expect(result).toBe('<svg>ok</svg>');
  });

  it('permanently rejects after MAX_INIT_RETRIES (3) failures', async () => {
    mockMathJaxModules(() => { throw new Error('always fails'); });

    const mod = await import(MATHJAX_PATH);
    mod.clearRenderCache();
    mod.resetMathJaxInit();

    // Exhaust all 3 retries
    for (let i = 0; i < 3; i++) {
      await expect(mod.renderTexToSvg('x', false, 5000)).rejects.toThrow();
    }

    // 4th call should reject with the permanent message
    await expect(mod.renderTexToSvg('x', false, 5000)).rejects.toThrow(
      /MathJax failed to initialize after 3 attempts/,
    );
  });

  it('concurrent calls during failure share the same promise and single init attempt', async () => {
    let callCount = 0;
    mockMathJaxModules(() => {
      callCount++;
      throw new Error(`fail-${callCount}`);
    });

    const mod = await import(MATHJAX_PATH);
    mod.clearRenderCache();
    mod.resetMathJaxInit();

    // Launch two concurrent calls — both should fail with the same error
    const p1 = mod.renderTexToSvg('a', false, 5000).catch((e: Error) => e.message);
    const p2 = mod.renderTexToSvg('b', false, 5000).catch((e: Error) => e.message);

    const [msg1, msg2] = await Promise.all([p1, p2]);
    expect(msg1).toBe(msg2);
    // Only one actual init attempt was made
    expect(callCount).toBe(1);
  });

  it('successful init resets after resetMathJaxInit', async () => {
    mockMathJaxModules(() => ({
      mathjax: { document: () => ({ convert: () => 'node' }) },
    }));

    const mod = await import(MATHJAX_PATH);
    mod.clearRenderCache();
    mod.resetMathJaxInit();

    const result = await mod.renderTexToSvg('x^2', false, 5000);
    expect(result).toBe('<svg>ok</svg>');
  });
});

describe('resetMathJaxInit', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported and callable', async () => {
    mockMathJaxModules(() => { throw new Error('fail'); });
    const mod = await import(MATHJAX_PATH);
    expect(typeof mod.resetMathJaxInit).toBe('function');
    mod.resetMathJaxInit();
  });
});
