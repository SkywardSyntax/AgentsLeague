import { z } from 'zod';
import { randomUUID } from 'crypto';
import { renderTexToSvgServer } from '@/lib/server/mathjax';

export const runtime = 'nodejs';

const LatexSvgRequestSchema = z.object({
  tex: z.string().min(1).max(2_000),
  displayMode: z.boolean().optional(),
});

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
    const svg = await renderTexToSvgServer(parsed.data.tex, parsed.data.displayMode ?? false);
    return new Response(JSON.stringify({ svg }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TeX render failed';
    return new Response(JSON.stringify({ error: 'RENDER_FAILED', message }), {
      status: 422,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    });
  }
}

