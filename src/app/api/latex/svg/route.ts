import { z } from 'zod';
import { randomUUID } from 'crypto';
import { renderTexToSvgServer } from '@/lib/server/mathjax';

export const runtime = 'nodejs';

const LatexSvgRequestSchema = z.object({
  tex: z.string().min(1).max(10_000, 'TeX input exceeds maximum length of 10,000 characters'),
  displayMode: z.boolean().optional(),
});

const DANGEROUS_TAG_RE = /<\s*\/?\s*(script|foreignobject|iframe|object|embed|applet)\b[^>]*>/gi;
const EVENT_HANDLER_RE = /\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi;

/** Strip inline scripts and event handler attributes from SVG for safety. */
function stripDangerousContent(svg: string): string {
  let cleaned = svg.replace(DANGEROUS_TAG_RE, '');
  cleaned = cleaned.replace(EVENT_HANDLER_RE, '');
  return cleaned;
}

const VIEWBOX_RE = /viewBox\s*=\s*"([^"]*)"/;
const WIDTH_ATTR_RE = /\bwidth\s*=\s*"([^"]*)"/;
const HEIGHT_ATTR_RE = /\bheight\s*=\s*"([^"]*)"/;

/** Ensure the root <svg> has explicit width/height derived from viewBox when missing. */
function ensureSvgDimensions(svg: string): string {
  const vbMatch = svg.match(VIEWBOX_RE);
  if (!vbMatch) return svg;

  const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return svg;

  const [, , vbWidth, vbHeight] = parts as [number, number, number, number];
  if (vbWidth <= 0 || vbHeight <= 0) return svg;

  let result = svg;
  if (!WIDTH_ATTR_RE.test(svg)) {
    result = result.replace('<svg', `<svg width="${vbWidth}"`);
  }
  if (!HEIGHT_ATTR_RE.test(svg)) {
    result = result.replace('<svg', `<svg height="${vbHeight}"`);
  }
  return result;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'BAD_REQUEST', message: 'Request body must be JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    });
  }

  const parsed = LatexSvgRequestSchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
      },
    );
  }

  try {
    let svg = await renderTexToSvgServer(parsed.data.tex, parsed.data.displayMode ?? false);
    svg = stripDangerousContent(svg);
    svg = ensureSvgDimensions(svg);
    return new Response(JSON.stringify({ svg }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
        'X-Request-Id': requestId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TeX render failed';
    return new Response(JSON.stringify({ error: 'RENDER_FAILED', message }), {
      status: 422,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    });
  }
}

