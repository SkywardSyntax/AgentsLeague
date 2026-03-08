import type { DrawElement } from '@/types/agent';

// NOTE: When new DrawElement types are added, update elementPosition and
// computeBoundingBox switches below — they must stay exhaustive.

export interface CanvasSupportResult {
  canvas2d: boolean;
  webgl: boolean;
  reason?: string;
}

export type FallbackDescriptor =
  | { type: 'none' }
  | { type: 'no-content'; message: string }
  | { type: 'element-list'; entries: FallbackEntry[] }
  | { type: 'summary'; count: number; boundingBox: { minX: number; minY: number; maxX: number; maxY: number } };

export interface FallbackEntry {
  id: string;
  type: string;
  position: string;
}

const ELEMENT_LIST_THRESHOLD = 20;

export function detectCanvasSupport(): CanvasSupportResult {
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return { canvas2d: false, webgl: false, reason: 'createElement threw' };
  }

  let canvas2d = false;
  let webgl = false;
  let reason: string | undefined;

  try {
    canvas2d = canvas.getContext('2d') !== null;
    if (!canvas2d) reason = 'getContext returned null';
  } catch (e) {
    canvas2d = false;
    reason = e instanceof Error ? e.message : String(e);
  }

  try {
    webgl = canvas.getContext('webgl') !== null;
  } catch (e) {
    webgl = false;
    const webglReason = e instanceof Error ? e.message : String(e);
    reason = reason ?? webglReason;
  }

  return reason !== undefined ? { canvas2d, webgl, reason } : { canvas2d, webgl };
}

function elementPosition(el: DrawElement): string {
  switch (el.type) {
    case 'rect':
      return `x=${el.x}, y=${el.y}, w=${el.w}, h=${el.h}`;
    case 'ellipse':
      return `cx=${el.cx}, cy=${el.cy}, rx=${el.rx}, ry=${el.ry}`;
    case 'line':
    case 'arrow':
      return `from=(${el.from.x},${el.from.y}) to=(${el.to.x},${el.to.y})`;
    case 'text':
    case 'latex':
      return `x=${el.x}, y=${el.y}`;
    case 'clear':
      return 'clear';
    case 'cartesian_axes':
    case 'number_line':
    case 'vector_arrow':
    case 'function_curve':
    case 'matrix_bracket':
    case 'angle_arc':
    case 'integral_region':
    default:
      return el.type;
  }
}

function computeBoundingBox(elements: DrawElement[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    switch (el.type) {
      case 'rect':
        minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.w); maxY = Math.max(maxY, el.y + el.h);
        break;
      case 'ellipse':
        minX = Math.min(minX, el.cx - el.rx); minY = Math.min(minY, el.cy - el.ry);
        maxX = Math.max(maxX, el.cx + el.rx); maxY = Math.max(maxY, el.cy + el.ry);
        break;
      case 'line': case 'arrow':
        minX = Math.min(minX, el.from.x, el.to.x); minY = Math.min(minY, el.from.y, el.to.y);
        maxX = Math.max(maxX, el.from.x, el.to.x); maxY = Math.max(maxY, el.from.y, el.to.y);
        break;
      case 'text': case 'latex':
        minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x); maxY = Math.max(maxY, el.y);
        break;
      case 'clear':
        break;
    }
  }
  return { minX, minY, maxX, maxY };
}

export function buildFallbackDescriptor(
  support: CanvasSupportResult,
  elements: DrawElement[],
): FallbackDescriptor {
  if (support.canvas2d) return { type: 'none' };

  if (elements.length === 0) {
    return { type: 'no-content', message: 'No content to display' };
  }

  if (elements.length > ELEMENT_LIST_THRESHOLD) {
    return {
      type: 'summary',
      count: elements.length,
      boundingBox: computeBoundingBox(elements),
    };
  }

  return {
    type: 'element-list',
    entries: elements.map((el) => ({
      id: el.id,
      type: el.type,
      position: elementPosition(el),
    })),
  };
}

export function formatContextLossWarning(support: CanvasSupportResult): string {
  return `Canvas context lost: ${support.reason ?? 'unknown reason'}`;
}
