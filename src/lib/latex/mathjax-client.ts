import { svgPathProperties } from 'svg-path-properties';
import type { Point, StrokeTrajectory } from '@/types/agent';
import { resamplePolyline } from '@/lib/whiteboard/geometry';
import { prepareTexForMathJax } from './tex-normalize';

type MathJaxContext = {
  html: { convert: (tex: string, options: { display: boolean; em: number; ex: number }) => unknown };
  adaptor: { outerHTML: (node: unknown) => string };
};

type Matrix2D = { a: number; b: number; c: number; d: number; e: number; f: number };

let mathJaxContextPromise: Promise<MathJaxContext> | undefined;
const renderCache = new Map<string, string>();
const MAX_RENDER_CACHE = 400;
const MAX_INIT_RETRIES = 3;
let initAttempts = 0;

let cacheHits = 0;
let cacheMisses = 0;
const pendingRenders = new Map<string, Promise<string>>();

function identityMatrix(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function multiplyMatrix(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function parseTransform(transform: string): Matrix2D {
  let current = identityMatrix();
  const commands = transform.match(/[a-zA-Z]+\([^)]+\)/g);
  if (!commands) return current;

  for (const cmd of commands) {
    if (cmd.startsWith('translate(')) {
      const values = cmd
        .slice(10, -1)
        .split(/[ ,]+/)
        .map((n) => Number(n.trim()))
        .filter(Number.isFinite);
      const [x = 0, y = 0] = values;
      current = multiplyMatrix(current, { a: 1, b: 0, c: 0, d: 1, e: x, f: y });
    } else if (cmd.startsWith('scale(')) {
      const values = cmd
        .slice(6, -1)
        .split(/[ ,]+/)
        .map((n) => Number(n.trim()))
        .filter(Number.isFinite);
      const [sx = 1, sy = sx] = values;
      current = multiplyMatrix(current, { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
    } else if (cmd.startsWith('matrix(')) {
      const values = cmd
        .slice(7, -1)
        .split(/[ ,]+/)
        .map((n) => Number(n.trim()))
        .filter(Number.isFinite);
      if (values.length === 6) {
        const [a, b, c, d, e, f] = values as [number, number, number, number, number, number];
        current = multiplyMatrix(current, { a, b, c, d, e, f });
      }
    }
  }

  return current;
}

function applyMatrix(pt: Point, m: Matrix2D): Point {
  return {
    x: pt.x * m.a + pt.y * m.c + m.e,
    y: pt.x * m.b + pt.y * m.d + m.f,
  };
}

function parseSvgLength(input: string | null | undefined): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(-?\d*\.?\d+(?:e[-+]?\d+)?)([a-z%]*)$/i);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] ?? 'px').toLowerCase();

  if (unit === '' || unit === 'px') return value;
  if (unit === 'ex') return value * 8;
  if (unit === 'em') return value * 16;
  if (unit === 'pt') return value * (96 / 72);
  if (unit === 'pc') return value * 16;
  if (unit === 'in') return value * 96;
  if (unit === 'cm') return value * (96 / 2.54);
  if (unit === 'mm') return value * (96 / 25.4);
  if (unit === 'q') return value * (96 / 101.6);
  return null;
}

function getSvgViewportMatrix(svgEl: SVGElement): Matrix2D {
  const viewBox = svgEl.getAttribute('viewBox');
  if (!viewBox) return identityMatrix();

  const parts = viewBox
    .trim()
    .split(/[ ,]+/)
    .map((n) => Number(n));
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return identityMatrix();

  const [minX, minY, vbWidth, vbHeight] = parts as [number, number, number, number];
  if (vbWidth === 0 || vbHeight === 0) return identityMatrix();

  const widthPx =
    parseSvgLength(svgEl.getAttribute('width')) ??
    parseSvgLength(svgEl.style?.width) ??
    vbWidth;
  const heightPx =
    parseSvgLength(svgEl.getAttribute('height')) ??
    parseSvgLength(svgEl.style?.height) ??
    vbHeight;

  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
    return identityMatrix();
  }

  const sx = widthPx / vbWidth;
  const sy = heightPx / vbHeight;
  return {
    a: sx,
    b: 0,
    c: 0,
    d: sy,
    e: -minX * sx,
    f: -minY * sy,
  };
}

async function initMathJax(): Promise<MathJaxContext> {
  const [
    mathjaxMod,
    texMod,
    svgMod,
    liteAdaptorMod,
    registerHandlerMod,
    allPackagesMod,
  ] = await Promise.all([
    import('mathjax-full/js/mathjax.js'),
    import('mathjax-full/js/input/tex.js'),
    import('mathjax-full/js/output/svg.js'),
    import('mathjax-full/js/adaptors/liteAdaptor.js'),
    import('mathjax-full/js/handlers/html.js'),
    import('mathjax-full/js/input/tex/AllPackages.js'),
  ]);

  const adaptor = liteAdaptorMod.liteAdaptor();
  registerHandlerMod.RegisterHTMLHandler(adaptor);
  const tex = new texMod.TeX({ packages: allPackagesMod.AllPackages });
  const svg = new svgMod.SVG({ fontCache: 'none' });
  const html = mathjaxMod.mathjax.document('', { InputJax: tex, OutputJax: svg });

  return {
    html: html as MathJaxContext['html'],
    adaptor: adaptor as unknown as MathJaxContext['adaptor'],
  };
}

async function getMathJaxContext(): Promise<MathJaxContext> {
  if (initAttempts >= MAX_INIT_RETRIES && !mathJaxContextPromise) {
    throw new Error(`MathJax failed to initialize after ${MAX_INIT_RETRIES} attempts`);
  }

  if (!mathJaxContextPromise) {
    initAttempts++;
    mathJaxContextPromise = initMathJax().catch((error: unknown) => {
      // Clear cached promise so the next call retries
      mathJaxContextPromise = undefined;
      throw error;
    });
  }

  return mathJaxContextPromise;
}

/** Reset init state — only for testing. */
export function resetMathJaxInit(): void {
  mathJaxContextPromise = undefined;
  initAttempts = 0;
}

const MAX_TEX_LENGTH = 10_000;
const RENDER_TIMEOUT_MS = 5_000;

export class RenderTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`TeX rendering timed out after ${timeoutMs}ms`);
    this.name = 'RenderTimeoutError';
  }
}

export class TexParseError extends Error {
  readonly source: string;
  constructor(message: string, source: string) {
    super(message);
    this.name = 'TexParseError';
    this.source = source;
  }
}

export class TexRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TexRenderError';
  }
}

const TEX_PARSE_ERROR_PATTERN =
  /TeX parse error|Unknown command|Undefined control sequence|Missing close brace|Missing open brace|Extra close brace|Extra open brace|Double superscript|Double subscript|Misplaced &|Missing \$ inserted|Missing \\right|Missing \\left/i;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RenderTimeoutError(ms)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export function getCachedSvg(tex: string, displayMode: boolean): string | undefined {
  const prepared = prepareTexForMathJax(tex, displayMode);
  const cacheKey = `render:${prepared.displayMode ? 'D' : 'I'}:${prepared.tex}`;
  const cached = renderCache.get(cacheKey);
  if (cached) {
    cacheHits++;
    renderCache.delete(cacheKey);
    renderCache.set(cacheKey, cached);
  } else {
    cacheMisses++;
  }
  return cached;
}

export function clearRenderCache(): void {
  renderCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

export function renderCacheStats(): { size: number; maxSize: number; hits: number; misses: number; hitRate: number } {
  const total = cacheHits + cacheMisses;
  return {
    size: renderCache.size,
    maxSize: MAX_RENDER_CACHE,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? cacheHits / total : 0,
  };
}

export async function renderTexToSvg(
  tex: string,
  displayMode: boolean,
  timeoutMs: number = RENDER_TIMEOUT_MS,
): Promise<string> {
  if (tex.length > MAX_TEX_LENGTH) {
    throw new Error(`TeX input exceeds maximum length of ${MAX_TEX_LENGTH} characters`);
  }
  const prepared = prepareTexForMathJax(tex, displayMode);
  const cacheKey = `render:${prepared.displayMode ? 'D' : 'I'}:${prepared.tex}`;

  const cached = renderCache.get(cacheKey);
  if (cached) {
    cacheHits++;
    renderCache.delete(cacheKey);
    renderCache.set(cacheKey, cached);
    return cached;
  }

  // Deduplicate concurrent renders for the same cache key
  const pending = pendingRenders.get(cacheKey);
  if (pending) {
    return pending;
  }

  cacheMisses++;
  const renderPromise = withTimeout(renderTexToSvgInner(tex, prepared, cacheKey), timeoutMs);
  pendingRenders.set(cacheKey, renderPromise);

  try {
    const result = await renderPromise;
    return result;
  } finally {
    pendingRenders.delete(cacheKey);
  }
}

async function renderTexToSvgInner(
  tex: string,
  prepared: { tex: string; displayMode: boolean },
  cacheKey: string,
): Promise<string> {
  const candidates = [prepared.tex];
  const rawTrimmed = tex.trim();
  if (rawTrimmed.length > 0 && rawTrimmed !== prepared.tex) {
    candidates.push(rawTrimmed);
  }

  const remember = (rendered: string) => {
    renderCache.delete(cacheKey);
    if (renderCache.size >= MAX_RENDER_CACHE) {
      const oldest = renderCache.keys().next().value as string | undefined;
      if (oldest) renderCache.delete(oldest);
    }
    renderCache.set(cacheKey, rendered);
    return rendered;
  };

  let lastError: unknown;
  try {
    const ctx = await getMathJaxContext();
    for (const candidate of candidates) {
      try {
        const node = ctx.html.convert(candidate, {
          display: prepared.displayMode,
          em: 16,
          ex: 8,
        });
        return remember(ctx.adaptor.outerHTML(node));
      } catch (error) {
        lastError = error;
      }
    }
  } catch (error) {
    lastError = error;
  }

  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/latex/svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          tex: prepared.tex,
          displayMode: prepared.displayMode,
        }),
      });
      if (res.ok) {
        const payload = (await res.json()) as { svg?: string };
        if (typeof payload.svg === 'string' && payload.svg.length > 0) {
          return remember(payload.svg);
        }
      } else {
        const errPayload = (await res.json().catch(() => ({}))) as { message?: string };
        if (errPayload.message) {
          lastError = new Error(errPayload.message);
        }
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof RenderTimeoutError) throw lastError;
  if (lastError instanceof TexParseError) throw lastError;
  const msg = lastError instanceof Error ? lastError.message : 'Failed to render TeX';
  if (TEX_PARSE_ERROR_PATTERN.test(msg)) {
    throw new TexParseError(msg, tex);
  }
  throw new TexRenderError(msg);
}

function parsePathPoints(d: string, matrix: Matrix2D, spacing: number): Point[] {
  const props = new svgPathProperties(d);
  const length = props.getTotalLength();
  if (!Number.isFinite(length) || length <= 0) return [];

  const points: Point[] = [];
  const steps = Math.max(2, Math.ceil(length / spacing));
  for (let i = 0; i <= steps; i++) {
    const pt = props.getPointAtLength((length * i) / steps);
    points.push(applyMatrix({ x: pt.x, y: pt.y }, matrix));
  }

  return resamplePolyline(points, spacing);
}

function splitPathSubpaths(d: string): string[] {
  const segments = d.match(/[Mm][^Mm]*/g);
  if (!segments || segments.length === 0) return [d];
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

function parseElementNumber(el: Element, attr: string): number | null {
  const raw = el.getAttribute(attr);
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parsePointsAttribute(points: string): Point[] {
  const nums = points
    .trim()
    .split(/[ ,\t\r\n]+/)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));

  const out: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: nums[i]!, y: nums[i + 1]! });
  }
  return out;
}

function pointsForRect(el: Element): Point[] {
  const x = parseElementNumber(el, 'x') ?? 0;
  const y = parseElementNumber(el, 'y') ?? 0;
  const width = parseElementNumber(el, 'width') ?? 0;
  const height = parseElementNumber(el, 'height') ?? 0;
  if (width <= 0 || height <= 0) return [];

  // Fraction bars are emitted as very thin rects in MathJax; draw their centerline.
  if (height <= 2.5) {
    const midY = y + height / 2;
    return [
      { x, y: midY },
      { x: x + width, y: midY },
    ];
  }

  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
    { x, y },
  ];
}

function pointsForLine(el: Element): Point[] {
  const x1 = parseElementNumber(el, 'x1');
  const y1 = parseElementNumber(el, 'y1');
  const x2 = parseElementNumber(el, 'x2');
  const y2 = parseElementNumber(el, 'y2');
  if (x1 == null || y1 == null || x2 == null || y2 == null) return [];
  return [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ];
}

function pointsForPolyline(el: Element, close: boolean): Point[] {
  const raw = el.getAttribute('points');
  if (!raw) return [];
  const pts = parsePointsAttribute(raw);
  if (close && pts.length > 1) pts.push(pts[0]!);
  return pts;
}

function applyMatrixToPolyline(points: Point[], matrix: Matrix2D, spacing: number): Point[] {
  if (points.length < 2) return [];
  return resamplePolyline(points.map((pt) => applyMatrix(pt, matrix)), spacing);
}

function getCumulativeMatrix(el: Element): Matrix2D {
  let matrix = identityMatrix();
  let current: Element | null = el;

  while (current) {
    const transform = current.getAttribute('transform');
    if (transform) matrix = multiplyMatrix(parseTransform(transform), matrix);
    current = current.parentElement;
  }

  return matrix;
}

export function extractSvgStrokes(
  svg: string,
  options: {
    offsetX: number;
    offsetY: number;
    scale: number;
    strokeIdPrefix: string;
    color: string;
    baseWidth: number;
  },
): StrokeTrajectory[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const drawables = Array.from(doc.querySelectorAll('path, rect, line, polyline, polygon'));
  const rootSvg = doc.querySelector('svg');
  const viewportMatrix = rootSvg ? getSvgViewportMatrix(rootSvg) : identityMatrix();
  const placementMatrix: Matrix2D = {
    a: options.scale,
    b: 0,
    c: 0,
    d: options.scale,
    e: options.offsetX,
    f: options.offsetY,
  };

  return drawables
    .flatMap((el, index) => {
      const tag = el.tagName.toLowerCase();

      const transformMatrix = multiplyMatrix(
        placementMatrix,
        multiplyMatrix(viewportMatrix, getCumulativeMatrix(el)),
      );

      if (tag === 'path') {
        const d = el.getAttribute('d');
        if (!d) return [];
        return splitPathSubpaths(d)
          .map((subpath, subpathIndex) => {
            const points = parsePathPoints(subpath, transformMatrix, 2);
            if (points.length < 2) return null;
            return {
              id: `${options.strokeIdPrefix}-latex-${index}-${subpathIndex}`,
              elementId: options.strokeIdPrefix,
              points,
              color: options.color,
              baseWidth: options.baseWidth,
            } satisfies StrokeTrajectory;
          })
          .filter((stroke): stroke is StrokeTrajectory => stroke !== null);
      }

      let points: Point[] = [];
      if (tag === 'rect') points = pointsForRect(el);
      if (tag === 'line') points = pointsForLine(el);
      if (tag === 'polyline') points = pointsForPolyline(el, false);
      if (tag === 'polygon') points = pointsForPolyline(el, true);

      const transformed = applyMatrixToPolyline(points, transformMatrix, 2);
      if (transformed.length < 2) return [];

      return [
        {
          id: `${options.strokeIdPrefix}-latex-${index}-shape`,
          elementId: options.strokeIdPrefix,
          points: transformed,
          color: options.color,
          baseWidth: options.baseWidth,
        } satisfies StrokeTrajectory,
      ];
    })
    .filter((stroke) => stroke.points.length >= 2);
}
