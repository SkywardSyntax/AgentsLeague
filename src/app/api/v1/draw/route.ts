// NOTE: This route requires the `canvas` npm package for server-side rendering.
// Install with: npm install canvas
// The `canvas` package requires native dependencies (Cairo, Pango).
// See: https://github.com/Automattic/node-canvas#compiling

import { z } from 'zod';
import { DrawBatchSchema } from '@/lib/schema';
import {
  applyMiddleware,
  compose,
  withErrorBoundary,
  withRequestId,
  withBodySizeLimit,
  withContentType,
  withRateLimit,
  withValidation,
  type HandlerContext,
} from '@/lib/server/api-middleware';
import { corsPreflightResponse } from '@/lib/cors';
import type { DrawBatch, DrawElement } from '@/types/agent';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 256 * 1024;

const middleware = compose(
  withRequestId,
  withErrorBoundary,
  withRateLimit({
    maxRequests: 30,
    windowMs: 60_000,
    keyExtractor: (request) =>
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown',
  }),
  (h) => withBodySizeLimit(MAX_BODY_BYTES, h),
  (h) => withContentType('application/json', h),
);

export async function OPTIONS() {
  return corsPreflightResponse();
}

/** Simple server-side rendering of basic draw elements to a canvas. */
function renderElementsToCanvas(
  ctx: CanvasRenderingContext2D,
  elements: DrawElement[],
  width: number,
  height: number,
) {
  // White background
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, width, height);

  for (const el of elements) {
    ctx.strokeStyle = el.color ?? '#1A1A2E';
    ctx.fillStyle = el.color ?? '#1A1A2E';
    ctx.lineWidth = el.stroke_width ?? 2;

    switch (el.type) {
      case 'rect': {
        const r = el as DrawElement & { x: number; y: number; w: number; h: number };
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        break;
      }
      case 'ellipse': {
        const e = el as DrawElement & { cx: number; cy: number; rx: number; ry: number };
        ctx.beginPath();
        ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'line': {
        const l = el as DrawElement & { from: { x: number; y: number }; to: { x: number; y: number } };
        ctx.beginPath();
        ctx.moveTo(l.from.x, l.from.y);
        ctx.lineTo(l.to.x, l.to.y);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        const a = el as DrawElement & { from: { x: number; y: number }; to: { x: number; y: number } };
        ctx.beginPath();
        ctx.moveTo(a.from.x, a.from.y);
        ctx.lineTo(a.to.x, a.to.y);
        ctx.stroke();
        // Arrowhead
        const dx = a.to.x - a.from.x;
        const dy = a.to.y - a.from.y;
        const angle = Math.atan2(dy, dx);
        const headLen = 10;
        ctx.beginPath();
        ctx.moveTo(a.to.x, a.to.y);
        ctx.lineTo(a.to.x - headLen * Math.cos(angle - 0.4), a.to.y - headLen * Math.sin(angle - 0.4));
        ctx.moveTo(a.to.x, a.to.y);
        ctx.lineTo(a.to.x - headLen * Math.cos(angle + 0.4), a.to.y - headLen * Math.sin(angle + 0.4));
        ctx.stroke();
        break;
      }
      case 'text': {
        const t = el as DrawElement & { x: number; y: number; text: string; size?: number };
        ctx.font = `${t.size ?? 14}px sans-serif`;
        ctx.fillText(t.text, t.x, t.y + (t.size ?? 14));
        break;
      }
      case 'clear': {
        ctx.fillStyle = '#FAFAFA';
        ctx.fillRect(0, 0, width, height);
        break;
      }
      default:
        // Complex element types not yet supported in server-side render
        break;
    }
  }
}

async function handler(
  request: Request,
  ctx: HandlerContext & { data: z.infer<typeof DrawBatchSchema> },
): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get('format') ?? 'png';
  const width = Math.min(4096, Math.max(100, parseInt(url.searchParams.get('width') ?? '1200', 10)));
  const height = Math.min(4096, Math.max(100, parseInt(url.searchParams.get('height') ?? '900', 10)));

  const batch = ctx.data as DrawBatch;
  const elements = batch.elements ?? [];

  // Try to load the canvas package
  let createCanvas: ((w: number, h: number) => { getContext: (type: string) => CanvasRenderingContext2D; toBuffer: (mime: string) => Buffer; toDataURL: (mime: string) => string; width: number; height: number }) | null = null;
  try {
    // Dynamic import of canvas package
    const canvasModule = await import('canvas');
    createCanvas = canvasModule.createCanvas as typeof createCanvas;
  } catch {
    return Response.json(
      {
        ok: false,
        error: 'CANVAS_NOT_INSTALLED',
        message: 'The "canvas" npm package is not installed. Install it with: npm install canvas',
        requestId: ctx.requestId,
      },
      { status: 501, headers: { 'X-Request-Id': ctx.requestId } },
    );
  }

  if (!createCanvas) {
    return Response.json(
      { ok: false, error: 'CANVAS_INIT_FAILED', message: 'Failed to initialize canvas', requestId: ctx.requestId },
      { status: 500, headers: { 'X-Request-Id': ctx.requestId } },
    );
  }

  const canvas = createCanvas(width, height);
  const canvasCtx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

  renderElementsToCanvas(canvasCtx, elements, width, height);

  if (format === 'json') {
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    return Response.json(
      {
        ok: true,
        imageBase64: base64,
        width,
        height,
        elementCount: elements.length,
      },
      {
        status: 200,
        headers: {
          'X-Request-Id': ctx.requestId,
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  // Default: return PNG
  const buffer = canvas.toBuffer('image/png');
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(buffer.length),
      'X-Request-Id': ctx.requestId,
      'Cache-Control': 'no-store',
    },
  });
}

export const POST = applyMiddleware(
  middleware,
  withValidation(DrawBatchSchema, handler),
);
