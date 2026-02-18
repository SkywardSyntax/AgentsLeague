/**
 * GET /api/health — Liveness and dependency check.
 *
 * Returns { status: "ok", openai_connected: boolean }.
 */

import OpenAI from 'openai';
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  let openaiConnected = false;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '', timeout: 5_000 });
    // Cheap request to verify connectivity
    await client.models.list({ timeout: 5_000 });
    openaiConnected = true;
  } catch {
    // OpenAI unreachable — degrade gracefully
  }

  return NextResponse.json(
    {
      status: 'ok',
      openai_connected: openaiConnected,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
