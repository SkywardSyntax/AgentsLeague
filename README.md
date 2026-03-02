# AgentsLeague

Interleaved AI chat + animated handwritten whiteboard built with Next.js and OpenAI Responses API.

## Features

- Streaming chat with SSE (`assistant.text.delta`)
- Interleaved draw batches from model tool calls (`whiteboard.batch`)
- Layered whiteboard renderer with parallel stroke animation
- Handwritten stroke jitter and variable pressure look
- LaTeX support in chat and whiteboard (MathJax TeX → SVG path conversion)
- Vector world-space rendering with zoom + hybrid stroke width clamp
- Local session persistence and restore

## Requirements

- Node.js 20+
- OpenAI API key

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

- `OPENAI_API_KEY` - required
- `OPENAI_MODEL` - defaults to `gpt-5.2`
- `OPENAI_BASE_URL` - configurable endpoint (OpenAI-compatible)
- `OPENAI_EXTRA_HEADERS_JSON` - JSON object of extra headers attached to each model call

## API Contract

`POST /api/agent/stream`

Request body:

```json
{
  "sessionId": "string",
  "userMessage": "string",
  "plannerMode": "semantic_preferred | legacy_draw_only",
  "whiteboardContextV2": {
    "scene_summary": {},
    "occupied_regions": [],
    "anchors": [],
    "recent_blocks": [],
    "suggested_next_regions": [],
    "token_budget_hint": { "max_chars": 2200 }
  },
  "history": [
    {
      "id": "string",
      "role": "user | assistant | system",
      "content": "string",
      "createdAt": 0
    }
  ]
}
```

SSE events emitted:

- `assistant.text.delta`
- `assistant.text.done`
- `whiteboard.batch`
- `whiteboard.layout.diagnostics`
- `warning`
- `error`
- `turn.done`

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run lint` - lint check
- `npm run type-check` - TypeScript check
- `npm run test:run` - run unit tests with coverage
