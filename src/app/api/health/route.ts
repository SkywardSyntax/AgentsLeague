/**
 * GET /api/health — Liveness and dependency check.
 *
 * Returns { status: "ok", openai_connected: boolean }.
 */

import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { generateETag, isNotModified } from '@/lib/api-cache';

export async function GET(request: Request): Promise<NextResponse> {
  let openaiConnected = false;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '', timeout: 5_000 });
    // Cheap request to verify connectivity
    await client.models.list({ timeout: 5_000 });
    openaiConnected = true;
  } catch {
    // OpenAI unreachable — degrade gracefully
  }

  const body = JSON.stringify({
    status: 'ok',
    openai_connected: openaiConnected,
    timestamp: new Date().toISOString(),
  });

  const etag = generateETag(body);
  if (isNotModified(request, etag)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return NextResponse.json(JSON.parse(body), {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
      ETag: etag,
    },
  });
}
