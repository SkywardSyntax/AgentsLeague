# AI Whiteboard — Next.js Backend Technical Plan

## Architecture Overview

```
┌──────────────┐     ┌─────────────────────────────────────────────────┐     ┌──────────┐
│              │     │  Next.js API Layer                              │     │          │
│   Client     │────▶│  ┌───────────┐  ┌───────────┐  ┌────────────┐  │────▶│  OpenAI  │
│  (Canvas +   │     │  │ Validation│─▶│ Rate Limit│─▶│ OpenAI     │  │     │  API     │
│   Chat UI)   │◀────│  │ (Zod)     │  │ Middleware│  │ Proxy      │  │     │          │
│              │     │  └───────────┘  └───────────┘  └────────────┘  │     └──────────┘
└──────────────┘     │                                                │
                     │  Streaming (ReadableStream / TransformStream)  │
                     └─────────────────────────────────────────────────┘
```

---

## 1. API Endpoints

| Method | Path              | Purpose                                   | Response         |
|--------|-------------------|-------------------------------------------|------------------|
| POST   | `/api/draw`       | Generate/modify whiteboard SVG via AI      | SSE stream       |
| POST   | `/api/chat`       | General chat about the whiteboard          | SSE stream       |
| GET    | `/api/health`     | Liveness + dependency checks               | JSON             |

### Route File Layout (App Router)

```
app/
├── api/
│   ├── draw/
│   │   └── route.ts          # POST — streaming drawing generation
│   ├── chat/
│   │   └── route.ts          # POST — streaming chat
│   └── health/
│       └── route.ts          # GET  — health check
├── lib/
│   ├── openai.ts             # OpenAI client + proxy logic
│   ├── validation.ts         # Zod schemas
│   ├── rate-limit.ts         # Rate-limiter
│   ├── errors.ts             # Error types + formatting
│   └── logger.ts             # Structured logger
```

---

## 2. Request Validation — Zod Schemas

```ts
// lib/validation.ts
import { z } from "zod";

// ── Shared ──────────────────────────────────────────────
const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(32_000),
});

// ── POST /api/draw ──────────────────────────────────────
export const DrawRequestSchema = z.object({
  prompt: z.string().min(1).max(4_000),
  // Current canvas state so the model can diff
  canvasState: z
    .object({
      svg: z.string().max(500_000).optional(),
      objects: z
        .array(
          z.object({
            id: z.string(),
            type: z.enum(["rect", "ellipse", "path", "text", "image", "group"]),
            data: z.record(z.unknown()),
          })
        )
        .max(2_000)
        .optional(),
    })
    .optional(),
  history: z.array(MessageSchema).max(50).optional(),
  model: z
    .enum(["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"])
    .default("gpt-4o-mini"),
});
export type DrawRequest = z.infer<typeof DrawRequestSchema>;

// ── POST /api/chat ──────────────────────────────────────
export const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(100),
  canvasContext: z.string().max(200_000).optional(),
  model: z
    .enum(["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"])
    .default("gpt-4o-mini"),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
```

### Validation middleware helper

```ts
// lib/validate.ts
import { NextRequest, NextResponse } from "next/server";
import { ZodSchema, ZodError } from "zod";

export async function validateBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const json = await req.json();
    const data = schema.parse(json);
    return { data };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        error: NextResponse.json(
          {
            error: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: err.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          },
          { status: 400 }
        ),
      };
    }
    return {
      error: NextResponse.json(
        { error: "BAD_REQUEST", message: "Malformed JSON" },
        { status: 400 }
      ),
    };
  }
}
```

---

## 3. OpenAI Proxy — Secure Forwarding

### Principles

1. **API key stays server-side only** — stored in `OPENAI_API_KEY` env var, never sent to client.
2. **Model allow-list** — Zod enum prevents callers from switching to arbitrary models.
3. **Timeout** — Hard 60s connection timeout; stream idle timeout of 30s.
4. **No raw passthrough** — We build the OpenAI request ourselves; clients cannot inject arbitrary fields.

```ts
// lib/openai.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!, // server-only
  timeout: 60_000,
  maxRetries: 2,
});

export { client as openai };

// ── System prompts ──────────────────────────────────────
export const DRAW_SYSTEM_PROMPT = `You are an AI whiteboard assistant.
When the user asks you to draw, reply ONLY with valid SVG wrapped in
<svg>…</svg> tags. Keep shapes simple and clean. You may include
<style> inside the SVG. Do not output anything outside the SVG tag.
If modifying existing content, output the full updated SVG.`;

export const CHAT_SYSTEM_PROMPT = `You are a helpful assistant that can
discuss the user's whiteboard. You can describe what's on the canvas,
suggest improvements, and answer questions. Be concise.`;
```

---

## 4. Streaming Implementation

### Strategy

We use the **OpenAI Node SDK streaming** to get an async iterable of chunks, then pipe them into a Web `ReadableStream` that Next.js App Router returns as an SSE response.

```ts
// lib/stream.ts
import { Stream } from "openai/streaming";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";

/**
 * Convert an OpenAI SDK stream into a Web ReadableStream of SSE events.
 * Each event is formatted as:
 *   data: {"token":"...","done":false}\n\n
 */
export function openAIStreamToSSE(
  stream: Stream<ChatCompletionChunk>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            const payload = JSON.stringify({ token: delta, done: false });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
        }
        // Final event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ token: "", done: true })}\n\n`
          )
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Stream interrupted";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: "STREAM_ERROR",
              message: msg,
              done: true,
            })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.controller.abort();
    },
  });
}
```

---

## 5. Route Handlers

### POST /api/draw — Streaming Drawing Generation

```ts
// app/api/draw/route.ts
import { NextRequest } from "next/server";
import { validateBody } from "@/lib/validate";
import { DrawRequestSchema } from "@/lib/validation";
import { openai, DRAW_SYSTEM_PROMPT } from "@/lib/openai";
import { openAIStreamToSSE } from "@/lib/stream";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleOpenAIError, errorResponse } from "@/lib/errors";

export const runtime = "nodejs"; // needed for streaming

export async function POST(req: NextRequest) {
  // ── Rate limit ──────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const rl = await rateLimit(ip, { windowMs: 60_000, max: 20 });
  if (!rl.ok) {
    return errorResponse("RATE_LIMITED", "Too many requests", 429, {
      retryAfter: rl.retryAfter,
    });
  }

  // ── Validate ────────────────────────────────────────
  const result = await validateBody(req, DrawRequestSchema);
  if ("error" in result) return result.error;
  const { prompt, canvasState, history, model } = result.data;

  // ── Build messages ──────────────────────────────────
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [{ role: "system", content: DRAW_SYSTEM_PROMPT }];

  if (canvasState?.svg) {
    messages.push({
      role: "user",
      content: `Current canvas SVG:\n${canvasState.svg}`,
    });
  }

  if (history) {
    messages.push(
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    );
  }

  messages.push({ role: "user", content: prompt });

  // ── Call OpenAI (streaming) ─────────────────────────
  const startTime = Date.now();
  logger.info("draw.start", { ip, model, promptLength: prompt.length });

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 16_000,
    });

    logger.info("draw.streaming", { latencyMs: Date.now() - startTime });

    return new Response(openAIStreamToSSE(stream), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Request-Id": crypto.randomUUID(),
      },
    });
  } catch (err) {
    logger.error("draw.error", { error: err, latencyMs: Date.now() - startTime });
    return handleOpenAIError(err);
  }
}
```

### POST /api/chat — Streaming Chat

```ts
// app/api/chat/route.ts
import { NextRequest } from "next/server";
import { validateBody } from "@/lib/validate";
import { ChatRequestSchema } from "@/lib/validation";
import { openai, CHAT_SYSTEM_PROMPT } from "@/lib/openai";
import { openAIStreamToSSE } from "@/lib/stream";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleOpenAIError, errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const rl = await rateLimit(ip, { windowMs: 60_000, max: 30 });
  if (!rl.ok) {
    return errorResponse("RATE_LIMITED", "Too many requests", 429, {
      retryAfter: rl.retryAfter,
    });
  }

  const result = await validateBody(req, ChatRequestSchema);
  if ("error" in result) return result.error;
  const { messages, canvasContext, model } = result.data;

  const systemMessages: { role: "system"; content: string }[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
  ];
  if (canvasContext) {
    systemMessages.push({
      role: "system",
      content: `Current canvas context:\n${canvasContext}`,
    });
  }

  const startTime = Date.now();
  logger.info("chat.start", { ip, model, messageCount: messages.length });

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: [...systemMessages, ...messages],
      stream: true,
      temperature: 0.7,
      max_tokens: 4_096,
    });

    return new Response(openAIStreamToSSE(stream), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Request-Id": crypto.randomUUID(),
      },
    });
  } catch (err) {
    logger.error("chat.error", { error: err, latencyMs: Date.now() - startTime });
    return handleOpenAIError(err);
  }
}
```

### GET /api/health

```ts
// app/api/health/route.ts
import { openai } from "@/lib/openai";
import { NextResponse } from "next/server";

export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {
    server: "ok",
    openai: "fail",
  };

  try {
    await openai.models.list({ timeout: 5_000 });
    checks.openai = "ok";
  } catch {
    checks.openai = "fail";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    },
    { status: healthy ? 200 : 503 }
  );
}
```

---

## 6. Error Handling

### Error Codes & HTTP Status Map

| Code                  | HTTP | Description                             |
|-----------------------|------|-----------------------------------------|
| `VALIDATION_ERROR`    | 400  | Zod validation failed                   |
| `BAD_REQUEST`         | 400  | Malformed JSON                          |
| `UNAUTHORIZED`        | 401  | Missing / invalid auth (future)         |
| `RATE_LIMITED`        | 429  | Too many requests                       |
| `OPENAI_AUTH_ERROR`   | 502  | Our OpenAI key is invalid               |
| `OPENAI_RATE_LIMIT`  | 429  | OpenAI rate limit hit — bubble up       |
| `OPENAI_OVERLOADED`  | 503  | OpenAI capacity issue                   |
| `OPENAI_TIMEOUT`     | 504  | Request to OpenAI timed out             |
| `STREAM_ERROR`       | 500  | Error during an active stream           |
| `INTERNAL_ERROR`     | 500  | Catch-all                               |

```ts
// lib/errors.ts
import { NextResponse } from "next/server";
import { APIError } from "openai";

export function errorResponse(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error: code, message, ...extra }, { status });
}

export function handleOpenAIError(err: unknown): NextResponse {
  if (err instanceof APIError) {
    switch (err.status) {
      case 401:
        return errorResponse(
          "OPENAI_AUTH_ERROR",
          "Upstream authentication failed",
          502
        );
      case 429:
        return errorResponse(
          "OPENAI_RATE_LIMIT",
          "AI service rate limit — please retry shortly",
          429,
          { retryAfter: 10 }
        );
      case 500:
      case 503:
        return errorResponse(
          "OPENAI_OVERLOADED",
          "AI service temporarily unavailable",
          503,
          { retryAfter: 30 }
        );
      default:
        return errorResponse(
          "INTERNAL_ERROR",
          `Upstream error: ${err.message}`,
          502
        );
    }
  }

  if (err instanceof Error && err.name === "AbortError") {
    return errorResponse("OPENAI_TIMEOUT", "Request timed out", 504);
  }

  return errorResponse("INTERNAL_ERROR", "An unexpected error occurred", 500);
}
```

### Client-Side Retry Logic (recommendation)

```ts
// Client-side utility (not in API routes — for reference)
async function fetchWithRetry(url: string, body: unknown, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) return res;

    const data = await res.json().catch(() => ({}));

    // Only retry on transient errors
    if (![429, 503, 504].includes(res.status)) throw new Error(data.message);

    const retryAfter = data.retryAfter ?? Math.pow(2, attempt) * 1000;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
  }
  throw new Error("Max retries exceeded");
}
```

---

## 7. Rate Limiting

### In-Memory Token Bucket (single-instance deployments)

```ts
// lib/rate-limit.ts

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.lastRefill > 300_000) store.delete(key);
  }
}, 300_000);

interface RateLimitOptions {
  windowMs: number; // e.g. 60_000 (1 minute)
  max: number; // max requests per window
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter?: number; // seconds
}

export async function rateLimit(
  key: string,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { tokens: opts.max, lastRefill: now };
    store.set(key, entry);
  }

  // Token-bucket refill
  const elapsed = now - entry.lastRefill;
  const refill = Math.floor((elapsed / opts.windowMs) * opts.max);
  if (refill > 0) {
    entry.tokens = Math.min(opts.max, entry.tokens + refill);
    entry.lastRefill = now;
  }

  if (entry.tokens <= 0) {
    const retryAfter = Math.ceil((opts.windowMs - elapsed) / 1000);
    return { ok: false, remaining: 0, retryAfter };
  }

  entry.tokens -= 1;
  return { ok: true, remaining: entry.tokens };
}
```

### For multi-instance / production: swap to **Upstash Redis** (`@upstash/ratelimit`)

```ts
// lib/rate-limit.production.ts  (alternative for production)
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

const limiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "60 s"),
  analytics: true,
});

export async function rateLimit(key: string) {
  const { success, remaining, reset } = await limiter.limit(key);
  return {
    ok: success,
    remaining,
    retryAfter: success ? undefined : Math.ceil((reset - Date.now()) / 1000),
  };
}
```

---

## 8. Response Formatting — SSE Protocol

### Wire Format

Every SSE frame contains a single `data:` line with a JSON object:

```
data: {"token":"<sv","done":false}

data: {"token":"g>","done":false}

data: {"token":"","done":true}
```

On error mid-stream:

```
data: {"error":"STREAM_ERROR","message":"Connection reset","done":true}
```

### Client-Side Consumer

```ts
async function consumeDrawStream(
  response: Response,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: { error: string; message: string }) => void
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop()!; // keep incomplete chunk

    for (const line of lines) {
      const match = line.match(/^data: (.+)$/);
      if (!match) continue;

      const payload = JSON.parse(match[1]);

      if (payload.error) {
        onError(payload);
        return;
      }
      if (payload.done) {
        onDone();
        return;
      }
      onToken(payload.token);
    }
  }
}
```

---

## 9. Logging & Monitoring

```ts
// lib/logger.ts

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LEVEL];
}

function log(level: LogLevel, event: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...meta,
  };

  // Structured JSON — compatible with Datadog, Vercel Logs, CloudWatch
  const output = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  debug: (event: string, meta?: Record<string, unknown>) =>
    log("debug", event, meta),
  info: (event: string, meta?: Record<string, unknown>) =>
    log("info", event, meta),
  warn: (event: string, meta?: Record<string, unknown>) =>
    log("warn", event, meta),
  error: (event: string, meta?: Record<string, unknown>) =>
    log("error", event, meta),
};
```

### What To Log

| Event                  | Level | Fields                                              |
|------------------------|-------|------------------------------------------------------|
| `draw.start`           | info  | ip, model, promptLength                              |
| `draw.streaming`       | info  | latencyMs (time-to-first-byte)                       |
| `draw.error`           | error | error message, status, latencyMs                     |
| `chat.start`           | info  | ip, model, messageCount                              |
| `chat.error`           | error | error message, status, latencyMs                     |
| `ratelimit.exceeded`   | warn  | ip, retryAfter                                       |
| `validation.failed`    | warn  | ip, path details                                     |
| `health.check`         | debug | checks object, healthy boolean                       |

### Telemetry (optional — Vercel / OpenTelemetry)

```ts
// instrumentation.ts  (Next.js instrumentation hook)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({ serviceName: "ai-whiteboard" });
  }
}
```

---

## 10. Environment Variables

```env
# .env.local (NEVER committed)
OPENAI_API_KEY=sk-...
LOG_LEVEL=info

# Production — rate limiting with Redis
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...

# Optional
NEXT_PUBLIC_APP_VERSION=1.0.0
```

---

## 11. Security Checklist

| Concern                | Mitigation                                                              |
|------------------------|-------------------------------------------------------------------------|
| API key leak           | Key in server-only env var; never serialized to client bundle           |
| Prompt injection       | System prompt is hardcoded server-side; user content is always `role:user` |
| Model hijacking        | Zod enum restricts to allowed models                                    |
| Payload bombs          | Max string lengths on all fields; max array sizes                       |
| Abuse / cost           | Per-IP rate limiting; max_tokens cap on OpenAI calls                    |
| CORS                   | Next.js defaults to same-origin; add middleware if needed               |
| Secrets in logs        | Logger never records request bodies or API keys                         |

---

## 12. Dependency Summary

```json
{
  "dependencies": {
    "next": "^15.x",
    "react": "^19.x",
    "openai": "^4.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^22.x",
    "@types/react": "^19.x"
  },
  "optionalDependencies": {
    "@upstash/ratelimit": "^2.x",
    "@upstash/redis": "^1.x",
    "@vercel/otel": "^1.x"
  }
}
```

---

## 13. Request Flow — End-to-End Sequence

```
Client                    Next.js API             OpenAI
  │                           │                       │
  │  POST /api/draw           │                       │
  │  {prompt, canvasState}    │                       │
  │──────────────────────────▶│                       │
  │                           │  Zod validate         │
  │                           │  Rate-limit check     │
  │                           │                       │
  │                           │  POST /chat/completions (stream:true)
  │                           │──────────────────────▶│
  │                           │                       │
  │                           │◀─── chunk 1 ──────────│
  │  data: {"token":"<","done":false}                 │
  │◀──────────────────────────│                       │
  │                           │◀─── chunk 2 ──────────│
  │  data: {"token":"svg","done":false}               │
  │◀──────────────────────────│                       │
  │           ...             │         ...           │
  │                           │◀─── [DONE] ───────────│
  │  data: {"token":"","done":true}                   │
  │◀──────────────────────────│                       │
  │                           │                       │
```
