# AgentsLeague — AI Whiteboard

An AI-powered collaborative whiteboard built with Next.js 15, React 19, TypeScript (strict mode), and Tailwind CSS v4. Users interact via text or voice to generate and manipulate canvas drawings through OpenAI's Responses API.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# → Fill in OPENAI_API_KEY at minimum

# 3. Run dev server
npm run dev          # → http://localhost:3000
```

## Available Scripts

| Script               | Command              | Description                      |
| -------------------- | -------------------- | -------------------------------- |
| `npm run dev`        | `next dev`           | Start dev server with hot reload |
| `npm run build`      | `next build`         | Production build                 |
| `npm start`          | `next start`         | Serve production build           |
| `npm run lint`       | `eslint src --fix`   | Lint and auto-fix                |
| `npm run format`     | `prettier --write src` | Format code                   |
| `npm run type-check` | `tsc --noEmit`       | TypeScript strict mode check     |
| `npm test`           | `vitest`             | Run tests in watch mode          |
| `npm run test:cov`   | `vitest run --coverage` | Run tests with coverage       |

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Home page with canvas + chat
│   └── api/                # Route handlers
│       ├── draw/route.ts   # AI drawing endpoint (SSE streaming)
│       ├── chat/route.ts   # Conversational AI endpoint
│       └── health/route.ts # Health check
├── components/             # React components
│   ├── canvas/             # Canvas rendering components
│   ├── chat/               # Chat panel & message UI
│   └── ui/                 # Shared UI primitives
├── hooks/                  # Custom React hooks
│   ├── ai/                 # useOpenAIStream — SSE streaming
│   ├── canvas/             # useStreamingDraw, useHandwrittenAnimation, useSelection
│   └── interaction/        # useTextMode, useVoiceMode, useInteractionMode
├── lib/                    # Core libraries
│   ├── openai/             # OpenAI client, streaming parser, error handling
│   ├── renderer/           # Canvas rendering engine with shape renderers
│   ├── performance/        # StreamingDrawController, SkeletonRenderer
│   ├── fonts/              # FontManager for handwritten text
│   ├── tool-workflow/      # DrawToolLoop, ToolResultBuilder, ContextManager
│   ├── layering/           # Layer management system
│   ├── selection/          # Spatial index for hit-testing
│   └── schema.ts           # Zod validation schemas
├── stores/                 # Zustand state management
│   ├── whiteboard-store.tsx # Canvas state (elements, camera, tool)
│   └── conversation-store.ts # Chat history & interaction mode
├── types/                  # TypeScript type definitions
│   ├── primitives.ts       # Branded types (Coordinate, ShapeId, etc.)
│   ├── drawing.ts          # DrawElement, BoundingBox, element types
│   ├── interaction.ts      # Voice state machine, messages
│   ├── state.ts            # Application state types
│   └── validation.ts       # Schema validation types
├── utils/
│   └── metrics.ts          # Performance monitoring
└── styles/
    └── globals.css         # Tailwind v4 directives
```

## Architecture

- **TypeScript Strict Mode** — `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` for maximum type safety
- **Branded Types** — `Coordinate`, `ShapeId`, `UnitFloat` prevent value misuse at compile time
- **SSE Streaming** — AI responses stream via Server-Sent Events for real-time drawing
- **rAF-batched Rendering** — `StreamingDrawController` batches draw operations per animation frame for 60fps
- **Skeleton Placeholders** — Show within 50ms while AI content streams, crossfade in 150ms
- **Voice State Machine** — Finite state machine: IDLE → LISTENING → TRANSCRIBING → SENDING → STREAMING → DRAWING → COMPLETE
- **Zustand Stores** — Lightweight state management for canvas and conversation
- **Vitest + jsdom** — Fast test runner with coverage thresholds (80% lines/functions/statements, 75% branches)

## Tech Stack

| Category     | Technology                              |
| ------------ | --------------------------------------- |
| Framework    | Next.js 15, React 19                   |
| Language     | TypeScript 5.6 (strict)                |
| Styling      | Tailwind CSS v4                        |
| State        | Zustand 5                              |
| AI           | OpenAI SDK 6 (Responses API)           |
| Validation   | Zod 4                                  |
| Testing      | Vitest 4, jsdom                        |
| Linting      | ESLint 9 (typescript-eslint type-checked) |

## Testing

```bash
# Run all tests
npm test

# Run tests once with coverage
npm run test:cov

# Run specific test file
npx vitest run src/lib/openai/__tests__/tool-parsing.test.ts
```

13 test files, 253 tests covering:
- Voice state machine transitions
- OpenAI tool call parsing & streaming
- Canvas shape renderers
- Selection & hit-testing
- Performance budgets (60fps, <2s TTFT)
- API route handlers with mocked OpenAI
- DrawToolLoop iteration & validation

## Spec Documents

| Document                              | Description                          |
| ------------------------------------- | ------------------------------------ |
| `TECHNICAL_SPEC.md`                   | Full technical specification         |
| `DESIGN.md`                           | UI/UX design document                |
| `DESIGN_SYSTEM.md`                    | Component design system              |
| `RESEARCH.md`                         | Research & competitive analysis      |
| `TESTING_PLAN.md`                     | Testing strategy & coverage targets  |
| `PERFORMANCE_STRATEGY.md`             | Performance budgets & optimization   |
| `INTERACTION_MODES_PLAN.md`           | Text & voice interaction modes       |
| `docs/BACKEND_PLAN.md`               | Backend architecture                 |
| `docs/drawing-engine-spec.md`        | Drawing engine specification         |
| `docs/handwritten-text-rendering-plan.md` | Handwritten text rendering      |
| `docs/openai-whiteboard-integration-plan.md` | OpenAI API integration        |
| `docs/TYPE_SYSTEM_ARCHITECTURE.md`   | Branded type system design           |

## License

ISC
