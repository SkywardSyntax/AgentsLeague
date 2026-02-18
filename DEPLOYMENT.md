# Deployment Guide

## Build & Deploy

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+

### Local Development

```bash
npm install
cp .env.example .env.local   # Fill in your API keys
npm run dev                   # http://localhost:3000
```

### Production Build

```bash
npm run build    # Outputs to .next/
npm run start    # Starts production server on port 3000
```

### Deploy to Vercel (Recommended)

1. Push repo to GitHub
2. Import in [vercel.com/new](https://vercel.com/new)
3. Set environment variables (see below)
4. Deploy — Vercel auto-detects Next.js

### Deploy via Docker

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Environment Variables

### Required

| Variable | Description | Example |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` |

### Optional — Model Configuration

| Variable | Default | Description |
|---|---|---|
| `OPENAI_MODEL` | `gpt-4o` | Primary model ID |
| `OPENAI_FALLBACK_MODEL` | `gpt-4o-mini` | Fallback for rate limits |
| `OPENAI_REASONING_MODEL` | `o4-mini` | Model for complex layout reasoning |
| `OPENAI_MAX_TOKENS` | `4096` | Max tokens per response |
| `OPENAI_TEMPERATURE` | `0.3` | Generation temperature (0–1) |
| `OPENAI_TOP_P` | `0.9` | Top-p sampling |
| `OPENAI_MAX_RETRIES` | `3` | Retries for 429/5xx errors |
| `OPENAI_TIMEOUT_SECONDS` | `30` | Per-request timeout |
| `OPENAI_STREAM` | `true` | Enable streaming responses |

### Optional — Canvas

| Variable | Default | Description |
|---|---|---|
| `CANVAS_WIDTH` | `1200` | Default canvas width |
| `CANVAS_HEIGHT` | `800` | Default canvas height |
| `MAX_ELEMENTS` | `200` | Max elements per draw call |
| `MAX_DRAW_ITERATIONS` | `15` | Max iterative draw cycles |

### Optional — Infrastructure

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | — | Spec cache backend (optional) |
| `CACHE_TTL_SECONDS` | `3600` | Cache TTL |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

---

## Performance Budgets (Verified)

| Metric | Budget | Actual | Status |
|---|---|---|---|
| First Load JS (main page) | < 200 KB | **131 KB** | ✅ Pass |
| Shared JS bundle | < 120 KB | **102 KB** | ✅ Pass |
| TypeScript errors | 0 | **0** | ✅ Pass |
| ESLint errors | 0 | **0** | ✅ Pass |
| Unit test pass rate | > 90% | **100% (539/539)** | ✅ Pass |
| Build time | < 30s | **~5s** | ✅ Pass |

---

## Security Checklist

- [x] API keys stored in environment variables only (never in client code)
- [x] Server-side API routes (`/api/chat`, `/api/draw`, `/api/health`) proxy OpenAI calls
- [x] No secrets committed to source control (`.env.local` in `.gitignore`)
- [x] Input validation via Zod schemas on all API endpoints
- [x] CSP-compatible: no inline scripts or eval
- [x] Error responses sanitized — no stack traces or internal details exposed
- [x] Rate limit awareness with retry-after headers
- [x] AbortController support for request cancellation
- [x] TypeScript strict mode with `exactOptionalPropertyTypes` enabled
- [x] ESLint strict rules (no-unsafe-any, no-unused-vars)

---

## API Endpoints

| Route | Method | Description |
|---|---|---|
| `/api/chat` | POST | Chat completions (SSE stream) |
| `/api/draw` | POST | Drawing generation (SSE stream) |
| `/api/health` | GET | Health check |

---

## Monitoring

- `/api/health` returns `200 OK` when the server is running
- Client-side performance metrics logged via `useRenderer` performance tracking
- Drawing session state tracked in `useDrawingSessionStore`
