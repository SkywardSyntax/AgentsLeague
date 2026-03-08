/**
 * Whiteboard canvas export utilities.
 *
 * Addresses adversarial findings:
 * - G1: SecurityError from tainted canvas (cross-origin SVG/LaTeX) → try/catch with SVG fallback
 * - G2: Full-content export using strokesBoundingBox, not viewport capture
 * - G3: Offscreen canvas for high-res export, with createElement fallback
 * - G4: Explicit background handling — skip bg layer when transparent requested
 * - G7: Clipboard API requires HTTPS — detect insecure context and throw descriptive error
 */

import type { StrokeTrajectory, LatexElement, Point } from '@/types/agent';
import { strokesBoundingBox, catmullRomToBezier } from '@/lib/whiteboard/geometry';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExportFormat = 'png' | 'svg' | 'clipboard';

export interface ExportOptions {
  format: ExportFormat;
  /** Pixel scale multiplier (1 = 72dpi, 2 = retina, 4 = print) */
  scale: number;
  /** Fill background with white (false = transparent PNG) */
  whiteBackground: boolean;
  /** Include the grid pattern in export */
  includeGrid: boolean;
  /** World-space padding around content bounds */
  padding: number;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'png',
  scale: 2,
  whiteBackground: true,
  includeGrid: false,
  padding: 20,
};

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  strokeCount: number;
}

/** LaTeX element info for enhanced SVG export with embedded MathJax SVGs. */
export interface LatexExportInfo {
  id: string;
  x: number;
  y: number;
  tex: string;
  displayMode: boolean;
  fontSize: number;
  color: string;
  /** Cached MathJax SVG output (if available). */
  cachedSvg?: string;
}

/** Imperative handle exposed by WhiteboardCanvas via forwardRef */
export interface WhiteboardExportHandle {
  exportAsPNG(scale?: number, whiteBackground?: boolean): Promise<Blob>;
  exportAsSVG(latexElements?: LatexExportInfo[]): string;
  copyToClipboard(): Promise<void>;
  getStrokeData(): StrokeTrajectory[];
  getContentBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null;
  clearCanvas(): void;
  fitToContent(): void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Max pixels per side — guards against OOM (EXPORT-001) */
const MAX_DIMENSION = 32_000;
/** Max total pixel budget (~256 MP) to prevent area-based OOM */
const MAX_PIXEL_BUDGET = 256_000_000;

// ─── Core Rendering ──────────────────────────────────────────────────────────

/**
 * Create an offscreen canvas, falling back to document.createElement for
 * environments without OffscreenCanvas (G3).
 */
function createOffscreen(width: number, height: number): {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get OffscreenCanvas 2d context');
    return { canvas, ctx };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');
  return { canvas, ctx };
}

/**
 * Render all strokes onto an offscreen canvas at the given scale.
 * Re-renders from stroke data (not screen-capture) for max quality (G2).
 */
export async function renderStrokesToBlob(
  strokes: StrokeTrajectory[],
  options: ExportOptions,
): Promise<ExportResult> {
  if (strokes.length === 0) {
    throw new Error('No content to export');
  }

  const bounds = strokesBoundingBox(strokes, options.padding);
  if (!bounds) throw new Error('Cannot compute content bounds');

  const canvasWidth = Math.ceil(bounds.width * options.scale);
  const canvasHeight = Math.ceil(bounds.height * options.scale);

  if (canvasWidth > MAX_DIMENSION || canvasHeight > MAX_DIMENSION) {
    throw new Error(
      `Export dimensions too large: ${canvasWidth}×${canvasHeight}. Reduce scale or content size.`,
    );
  }
  if (canvasWidth * canvasHeight > MAX_PIXEL_BUDGET) {
    throw new Error(
      `Export pixel budget exceeded (${(canvasWidth * canvasHeight / 1e6).toFixed(0)} MP). Reduce scale.`,
    );
  }

  const { canvas, ctx } = createOffscreen(canvasWidth, canvasHeight);

  // G4: only fill background when explicitly requested
  if (options.whiteBackground) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  if (options.includeGrid) {
    drawGridToContext(ctx, bounds, options.scale);
  }

  // Transform so world coords map to canvas pixels
  ctx.setTransform(
    options.scale, 0,
    0, options.scale,
    -bounds.minX * options.scale,
    -bounds.minY * options.scale,
  );

  for (const stroke of strokes) {
    drawExportStroke(ctx, stroke.points, stroke.color, stroke.baseWidth);
  }

  // G1: wrap blob conversion in try/catch for tainted canvas SecurityError
  try {
    const blob = await canvasToBlob(canvas);
    return { blob, width: canvasWidth, height: canvasHeight, strokeCount: strokes.length };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new Error(
        'Canvas is tainted by cross-origin content (e.g. LaTeX SVG). Use SVG export instead.',
      );
    }
    throw err;
  }
}

/** Convert canvas or OffscreenCanvas to a PNG Blob. */
async function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  const htmlCanvas = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    htmlCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    );
  });
}

/**
 * Draw a single stroke with Catmull-Rom → Bézier smoothing for export quality.
 * Renders in world coordinates (no DPR/zoom conversion needed).
 */
function drawExportStroke(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseWidth: number,
): void {
  if (points.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = baseWidth;

  if (points.length < 4) {
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i]!.x, points[i]!.y);
    }
    ctx.stroke();
    return;
  }

  const segs = catmullRomToBezier(points);
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (const seg of segs) {
    ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p3.x, seg.p3.y);
  }
  ctx.stroke();
}

function drawGridToContext(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  bounds: { minX: number; minY: number; width: number; height: number },
  scale: number,
): void {
  const gridSpacing = 30;
  ctx.strokeStyle = 'rgba(77, 93, 118, 0.10)';
  ctx.lineWidth = 1;

  const startX = Math.floor(bounds.minX / gridSpacing) * gridSpacing;
  const startY = Math.floor(bounds.minY / gridSpacing) * gridSpacing;
  const endX = bounds.minX + bounds.width;
  const endY = bounds.minY + bounds.height;

  for (let x = startX; x <= endX; x += gridSpacing) {
    const px = (x - bounds.minX) * scale;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, bounds.height * scale);
    ctx.stroke();
  }

  for (let y = startY; y <= endY; y += gridSpacing) {
    const py = (y - bounds.minY) * scale;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(bounds.width * scale, py);
    ctx.stroke();
  }
}

// ─── Layer Compositing (quick clipboard path) ────────────────────────────────

/**
 * Fast export by compositing the three visible canvas layers.
 * G4: only draws bgCanvas when whiteBackground is true; when transparent
 * is requested the bg layer (which contains the grid) is excluded.
 */
export function compositeCanvasLayers(
  bgCanvas: HTMLCanvasElement,
  committedCanvas: HTMLCanvasElement,
  activeCanvas: HTMLCanvasElement,
  whiteBackground: boolean,
): HTMLCanvasElement {
  const width = committedCanvas.width;
  const height = committedCanvas.height;
  const composite = document.createElement('canvas');
  composite.width = width;
  composite.height = height;

  const ctx = composite.getContext('2d')!;

  if (whiteBackground) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    // Include grid bg only when white background is on
    ctx.drawImage(bgCanvas, 0, 0);
  }
  // G4: skip bgCanvas when transparent export is selected

  ctx.drawImage(committedCanvas, 0, 0);
  ctx.drawImage(activeCanvas, 0, 0);

  return composite;
}

// ─── Clipboard ───────────────────────────────────────────────────────────────

/**
 * Copy canvas layers to clipboard as PNG.
 * G1: try/catch for SecurityError on tainted canvas.
 * G7: detect insecure context and throw descriptive error with download hint.
 */
export async function copyCanvasLayersToClipboard(
  bgCanvas: HTMLCanvasElement,
  committedCanvas: HTMLCanvasElement,
  activeCanvas: HTMLCanvasElement,
): Promise<void> {
  // G7: Clipboard API requires secure context (HTTPS or localhost)
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error(
      'Clipboard requires HTTPS. Use "Download PNG" instead.',
    );
  }

  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error(
      'Clipboard API not supported in this browser. Use "Download PNG" instead.',
    );
  }

  const composite = compositeCanvasLayers(bgCanvas, committedCanvas, activeCanvas, true);

  let blob: Blob;
  try {
    blob = await new Promise<Blob>((resolve, reject) => {
      composite.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
        'image/png',
      );
    });
  } catch (err) {
    // G1: tainted canvas SecurityError
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new Error(
        'Canvas is tainted by cross-origin content. Use SVG export instead.',
      );
    }
    throw err;
  }

  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
}

// ─── SVG Export ──────────────────────────────────────────────────────────────

export interface SvgExportOptions {
  whiteBackground: boolean;
  padding: number;
  /** Embed MathJax SVG output directly for these LaTeX elements. */
  latexElements?: LatexExportInfo[];
}

const DEFAULT_SVG_OPTIONS: SvgExportOptions = {
  whiteBackground: true,
  padding: 20,
};

/**
 * Convert stroke trajectories to a standalone SVG string.
 * Uses Catmull-Rom → Bézier conversion for smooth paths.
 * Full-content export — uses world-space bounds, not viewport (G2).
 *
 * When `latexElements` are provided, their MathJax SVG is embedded directly
 * as nested `<g>` nodes and the stroke-based paths for those elements are skipped.
 */
export function exportStrokesToSVG(
  strokes: StrokeTrajectory[],
  options: Partial<SvgExportOptions> = {},
): string {
  const opts = { ...DEFAULT_SVG_OPTIONS, ...options };
  const latexEls = opts.latexElements ?? [];

  if (strokes.length === 0 && latexEls.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>';
  }

  // Build set of element IDs that have embedded LaTeX SVG
  const embeddedLatexIds = new Set<string>();
  for (const el of latexEls) {
    if (el.cachedSvg) {
      embeddedLatexIds.add(el.id);
    }
  }

  // Filter out stroke paths that originated from embedded LaTeX elements
  const filteredStrokes = embeddedLatexIds.size > 0
    ? strokes.filter((s) => !embeddedLatexIds.has(s.elementId))
    : strokes;

  const bounds = strokesBoundingBox(
    [...filteredStrokes, ...latexEls.map((el) => ({
      points: [{ x: el.x, y: el.y }, { x: el.x + 100, y: el.y + 30 }] as Point[],
    }))],
    opts.padding,
  );
  if (!bounds) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>';
  }

  const paths = filteredStrokes.map((stroke) => strokeToSVGPath(stroke));

  const bg = opts.whiteBackground
    ? `  <rect width="${bounds.width}" height="${bounds.height}" fill="#ffffff"/>\n`
    : '';

  // Build embedded LaTeX SVG nodes
  const latexNodes: string[] = [];
  for (const el of latexEls) {
    if (!el.cachedSvg) continue;
    // Extract inner SVG content — strip the outer <svg> wrapper and embed as <g>
    const innerSvg = extractSvgInnerContent(el.cachedSvg);
    if (!innerSvg) continue;

    const scale = (el.fontSize ?? 16) / 16;
    latexNodes.push(
      `    <g transform="translate(${el.x}, ${el.y}) scale(${scale})" data-latex-id="${el.id}" data-tex="${escapeXmlAttr(el.tex)}">`,
      `      ${innerSvg}`,
      `    </g>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `     width="${bounds.width}" height="${bounds.height}"`,
    `     viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}">`,
    bg,
    `  <g stroke-linecap="round" stroke-linejoin="round" fill="none">`,
    ...paths.filter(Boolean).map((p) => `    ${p}`),
    `  </g>`,
    ...(latexNodes.length > 0 ? [
      `  <g class="latex-elements">`,
      ...latexNodes,
      `  </g>`,
    ] : []),
    `</svg>`,
  ].join('\n');
}

/** Extract the inner content of an SVG string (everything inside the root <svg> tag). */
function extractSvgInnerContent(svgString: string): string | null {
  // Find opening <svg ...> tag end
  const openMatch = svgString.match(/<svg[^>]*>/);
  if (!openMatch) return null;
  const start = openMatch.index! + openMatch[0].length;
  // Find closing </svg>
  const closeIdx = svgString.lastIndexOf('</svg>');
  if (closeIdx <= start) return null;
  return svgString.slice(start, closeIdx).trim();
}

/** Escape a string for use in XML attributes. */
function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function strokeToSVGPath(stroke: StrokeTrajectory): string {
  const { points, color, baseWidth } = stroke;
  if (points.length < 2) return '';

  let d: string;
  if (points.length < 4) {
    d = `M ${points[0]!.x} ${points[0]!.y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i]!.x} ${points[i]!.y}`;
    }
  } else {
    const segs = catmullRomToBezier(points);
    d = `M ${points[0]!.x} ${points[0]!.y}`;
    for (const seg of segs) {
      d += ` C ${seg.cp1.x} ${seg.cp1.y}, ${seg.cp2.x} ${seg.cp2.y}, ${seg.p3.x} ${seg.p3.y}`;
    }
  }

  // Escape color for XML safety
  const safeColor = color.replace(/[&<>"']/g, '');
  return `<path d="${d}" stroke="${safeColor}" stroke-width="${baseWidth}" data-stroke-id="${stroke.id}"/>`;
}

// ─── Download Trigger ────────────────────────────────────────────────────────

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
