# AI Drawing & Whiteboarding Research Summary

> Synthesized research across 8 domains for the AgentsLeague project.

---

## 1. Existing Solutions Analysis

### Excalidraw
- **Architecture**: TypeScript + React, straightforward canvas rendering, MIT license
- **Strengths**: Instant pick-up-and-use, hand-drawn aesthetic, offline-first PWA, open JSON format, privacy-focused, minimal dependencies
- **Weaknesses**: Limited SDK/integration story, lighter on AI features, fewer enterprise extensions
- **Key insight**: The informal hand-drawn look is a *deliberate design choice* that reduces user anxiety about "getting it right"
- 🔗 https://excalidraw.com | https://github.com/excalidraw/excalidraw

### Tldraw
- **Architecture**: TypeScript React SDK — every drawn element is a React component; supports custom backends
- **Strengths**: Infinite canvas SDK, deep extensibility, rich media embedding (images/videos/webpages), advanced real-time collab, emerging AI integrations (shape recognition, autocompletion)
- **Weaknesses**: Complexity for end users, $499/month commercial SDK, GPLv3 core license
- **Key insight**: SDK-first model makes it ideal for *embedding* custom whiteboard experiences in apps
- 🔗 https://tldraw.com | https://github.com/tldraw/tldraw

### OpenAI Canvas
- **Architecture**: React-based frontend, GPT-4o backend with context management, WASM-based Python sandbox for code execution
- **Strengths**: Inline AI suggestions (highlight → edit), version history, contextual shortcuts (review code, fix bugs, port languages), side-by-side collaborative workspace
- **Weaknesses**: Not a drawing tool per se — focused on text/code editing; sandboxed file limitations
- **Key insight**: AI as "collaborative partner" with full document visibility, not just chat-and-respond
- 🔗 https://openai.com/index/introducing-canvas/

### Claude Artifacts
- **Strengths**: Live-rendered React/HTML/SVG in sandboxed iframe, instant visualization of generated code, progressive streaming of artifact content
- **Key insight**: Separating "conversation" from "output artifact" is a powerful UX pattern — the artifact becomes the *thing being iterated on*

### ✅ Key Takeaway
> The winning pattern is **conversation + persistent canvas artifact** — where AI suggests, user accepts/rejects, and the artifact evolves. This is the model to follow.

---

## 2. Drawing Animation Techniques

### SVG Stroke-Dasharray (Primary Technique)
```css
@keyframes draw {
  to { stroke-dashoffset: 0; }
}
path {
  stroke-dasharray: 400;   /* = total path length */
  stroke-dashoffset: 400;
  animation: draw 2s ease-in-out forwards;
  fill: none;
}
```
- Calculate path length with `path.getTotalLength()`
- Normalize with `pathLength="100"` attribute for easy timing coordination
- Use `stroke-linecap="round"` for natural-looking reveals

### JavaScript Control
```js
const path = document.querySelector('path');
const length = path.getTotalLength();
path.style.strokeDasharray = length;
path.style.strokeDashoffset = length;
path.style.transition = 'stroke-dashoffset 2s ease';
requestAnimationFrame(() => path.style.strokeDashoffset = 0);
```

### Canvas Path Animation
- Manual frame-by-frame: draw path segments incrementally in render loop
- Use `requestAnimationFrame` for sync with display refresh
- Track progress as percentage of total path, draw partial segments each frame

### Libraries
| Library | Best For |
|---------|----------|
| **GSAP DrawSVGPlugin** | Sequenced, interactive SVG animation |
| **KUTE.js** | Open-source dasharray/dashoffset animation |
| **Web Animations API** | Native browser, no library needed |
| **Framer Motion** | React-native integration |

### ✅ Key Takeaway
> SVG `stroke-dasharray`/`stroke-dashoffset` is the industry standard for "self-drawing" effects. For Canvas-based drawing, animate by incrementally rendering path segments in a `requestAnimationFrame` loop. Always pair with `prefers-reduced-motion` for accessibility.

---

## 3. Latency Masking Patterns

### Streaming (Industry Standard)
- **Server-Sent Events (SSE)** is the dominant transport for LLM streaming (simpler than WebSocket, one-way)
- First tokens appear in < 2 seconds vs 8–20s for full response → **~40% perceived faster** even with identical backend time
- Update UI per token/chunk; maintain independent `isTyping` state

### Progressive Rendering Stack
1. **Skeleton screens** — animated placeholders matching expected output shape (not spinners)
2. **Typing indicators** — bouncing dots or mini-avatar "typing" (borrowed from chat UX)
3. **Progressive disclosure** — reveal content in logical sections as available
4. **Interruptibility** — let users stop/cancel mid-stream (critical for agency)

### ChatGPT Pattern
```
[User sends message]
  → Animated dots "thinking" indicator
  → Streaming text appears word-by-word
  → Code blocks render with syntax highlighting once complete
  → Action buttons appear after stream ends
```

### Claude Pattern
```
[User sends message]
  → Subtle "thinking" shimmer
  → Paragraphs stream with editorial fluidity
  → Artifacts render progressively in side panel
  → Suggested follow-ups appear post-completion
```

### Implementation Tips
- Mix skeleton headers (rendered instantly) with body content streaming word-by-word
- Provide fallback: if streaming fails, show buffered final response
- Use `animation-fill-mode: forwards` to keep final state

### ✅ Key Takeaway
> **SSE streaming + skeleton screens + typing indicators** is the proven trifecta. Users rate streaming interfaces ~40% faster even with identical backend times. Always include an interrupt/cancel mechanism.

---

## 4. Voice UI Patterns

### Core Engagement Patterns
| Pattern | Description |
|---------|-------------|
| **Immediate feedback** | "I'm searching for that now…" — user feels heard |
| **Progressive disclosure** | Reveal info in digestible chunks, not all at once |
| **Implicit confirmation** | "Setting timer for 5 minutes" (confirms without asking) |
| **Engagement loops** | "Would you like to add anything else?" — keeps session alive |
| **Strong persona** | Intentional personality increases trust and relatability |
| **Error recovery** | Graceful fallback with suggestions, never dead-ends |

### Voice-First Design Principles
1. **Context persistence** — maintain conversation state across turns (and sessions)
2. **Personalization** — learn preferences over time for proactive suggestions
3. **Emotional cues** — varied intonation in synthesized speech reduces robotic feel
4. **Conversational flow** — mirror natural human dialogue, not rigid command structures
5. **Accessibility** — support accents, dialects, speech impairments

### Applicable to Visual UI
- **"Thinking out loud"** — show intermediate reasoning/progress (not just final answer)
- **Suggestion chips** — surface 2-3 contextual next actions after each response
- **Proactive help** — anticipate what user needs next based on context

### ✅ Key Takeaway
> The most engaging voice UIs provide **immediate feedback**, maintain **context across turns**, and use **proactive suggestions** to keep momentum. These patterns translate directly to visual AI interfaces via typing indicators, streaming, and suggestion chips.

---

## 5. Apple Design Precedents

### Relevant HIG Patterns for "Next Steps" UI

| Apple Pattern | Our Application |
|---------------|----------------|
| **Progressive disclosure** | Show next actions only after current step completes |
| **Contextual menus/actions** | Surface relevant tools based on current canvas state |
| **Cards** | Group related info + actions; visually distinct, uncluttered |
| **Bottom sheets** | Present options without leaving current context |
| **Segmented controls / pills** | Lightweight action chips for mode switching |

### Apple Design Principles to Apply
1. **Deference** — UI should be visually lightweight so *content* (the drawing) stands out
2. **Clarity** — purpose of every UI element must be immediately apparent
3. **Depth** — use subtle animation, shadows, translucency to reinforce hierarchy
4. **Direct manipulation** — touch/click directly on the artifact, not through menus
5. **44×44pt minimum touch targets** — never go smaller

### Suggestion Chips (Apple-Style)
- Present as rounded-rect pill buttons with icon + short label
- Maximum 3-4 visible at once to avoid choice paralysis
- Contextually relevant to current state (not generic)
- Dismissible / auto-hide after action taken

### ✅ Key Takeaway
> Apple's HIG emphasizes **content-first UI** with progressive disclosure. For our "Next Steps" pattern: use contextual pill-shaped suggestion chips (max 3-4), present them after task completion, and ensure they're directly relevant to the user's current state.

---

## 6. WebGL/Canvas Performance (2025)

### Architecture Decision: Canvas 2D vs WebGL vs SVG

| Technology | Best For | Limits |
|-----------|----------|--------|
| **SVG** | < 1,000 elements, declarative, CSS-animatable | DOM overhead at scale |
| **Canvas 2D** | 1,000–10,000 elements, drawing/painting apps | Manual hit-testing |
| **WebGL** | > 10,000 elements, particle systems, 3D | Complexity, shader programming |

### Canvas 2D Best Practices
1. **OffscreenCanvas + Web Workers** — offload rendering from main thread
   ```js
   const offscreen = canvas.transferControlToOffscreen();
   worker.postMessage({ canvas: offscreen }, [offscreen]);
   ```
2. **Dirty region tracking** — only redraw changed areas, not full canvas
3. **Pre-render static layers** — blit via `drawImage()` from offscreen canvas
4. **Layer multiple canvases** — separate background, sprites, UI into stacked canvases
5. **Integer coordinates** — avoid sub-pixel anti-aliasing overhead
6. **`requestAnimationFrame`** — always; syncs to display refresh, pauses on inactive tabs

### WebGL Optimizations
- **Texture atlases** — minimize binding changes
- **Instanced rendering** — draw many copies with one draw call
- **Batch vertices** — send large buffers to GPU in single call
- **Compressed textures + mipmaps** — reduce memory bandwidth

### Modern Rendering Pipeline (2025)
```
Main Thread                 Worker Thread
─────────────              ──────────────
User input events    →     Receive state delta
                           Batch draw commands
                           Render to OffscreenCanvas
                     ←     Post ImageBitmap back
Display to screen
```

### ✅ Key Takeaway
> For a drawing app: **Canvas 2D with OffscreenCanvas** hits the sweet spot of performance and simplicity. Use dirty-region tracking, layered canvases, and `requestAnimationFrame`. Only escalate to WebGL for > 10K elements. SVG is fine for UI overlays and annotations.

---

## 7. Type Safety in Frontend (React + TypeScript)

### Discriminated Unions (Must-Use Pattern)
```typescript
type DrawingTool =
  | { kind: 'pen'; color: string; width: number }
  | { kind: 'eraser'; width: number }
  | { kind: 'shape'; shape: 'rect' | 'circle'; color: string };

// Exhaustive switch with compile-time safety
function getToolCursor(tool: DrawingTool): string {
  switch (tool.kind) {
    case 'pen': return 'crosshair';
    case 'eraser': return 'cell';
    case 'shape': return 'default';
    default: return ((x: never) => { throw new Error('Unknown'); })(tool);
  }
}
```

### Branded Types (For Domain IDs)
```typescript
type SessionId = string & { readonly __brand: 'SessionId' };
type DrawingId = string & { readonly __brand: 'DrawingId' };

function createSessionId(id: string): SessionId {
  return id as SessionId;
}
// Prevents: getDrawing(sessionId) — type error!
```

### React Component Props
```typescript
// Mutually exclusive props with `never`
type ButtonProps =
  | { variant: 'primary'; onClick: () => void; href?: never }
  | { variant: 'link'; href: string; onClick?: never };
```

### Strict Configuration
```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

### Key Rules
- Always use `"strict": true` — no exceptions
- Explicit return types on hooks and event handlers
- Never allow implicit `any` — use ESLint `@typescript-eslint/no-unsafe-*` rules
- Use consistent discriminant names (`kind`, `type`, or `variant` — pick one)
- Generic components for reusable list/select patterns

### ✅ Key Takeaway
> **Discriminated unions + branded types + strict tsconfig** form the type-safety trifecta for React+TS. Use discriminated unions for all state machines and component variants. Use branded types for domain identifiers (SessionId, DrawingId, etc.).

---

## 8. OpenAI Integration Patterns

### Responses API (Current Standard)
The Responses API replaces Chat Completions as the recommended API:

```typescript
const response = await openai.responses.create({
  model: "gpt-4o",
  tools: [{ type: "function", name: "draw_shape", ... }],
  input: [{ role: "user", content: "Draw a blue circle" }],
});
```

### Function Calling Flow
```
1. Define tools with JSON Schema parameters
2. Send prompt + tools to model
3. Receive function_call in response.output
4. Execute function locally with parsed arguments
5. Return function_call_output with call_id
6. Send everything back for final response
```

### Streaming with SSE
```typescript
const stream = await openai.responses.create({
  model: "gpt-4o",
  stream: true,
  input: messages,
});

for await (const event of stream) {
  if (event.type === 'response.output_text.delta') {
    appendToUI(event.delta);
  }
  if (event.type === 'response.function_call_arguments.delta') {
    accumulateArgs(event.delta);
  }
}
```

### Tool Use + Streaming Combined
- Stream partial function call arguments as they arrive
- Parse incrementally: accumulate JSON string, attempt parse on each delta
- Show "thinking" indicator while function executes
- Stream final response after function output is provided

### Built-in Tools
| Tool | Use Case |
|------|----------|
| `web_search` | Real-time web data |
| `code_interpreter` | Execute Python in sandbox |
| `remote_mcp` | Connect to MCP servers |
| `file_search` | RAG over uploaded files |

### Best Practices
1. **Always stream** — set `stream: true` for any user-facing interaction
2. **Structured outputs** — use `response_format: { type: "json_schema" }` for reliable parsing
3. **Parallel tool calls** — model can return multiple `function_call` items; execute in parallel
4. **Error handling** — always return `function_call_output` even on error (with error message)
5. **Token management** — use `max_output_tokens` to bound costs; track usage in response

### ✅ Key Takeaway
> Use the **Responses API** with `stream: true` and structured function definitions. Accumulate function call arguments incrementally during streaming. Always return function outputs (even errors) to maintain conversation flow. Leverage parallel tool calls for multi-step operations.

---

## Cross-Cutting Architecture Recommendations

Based on this research, the optimal architecture for an AI drawing agent combines:

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  React + TypeScript (strict mode)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Canvas2D │  │ SVG      │  │ React UI     │  │
│  │ Drawing  │  │ Overlays │  │ Panels/Chips │  │
│  │ Layer    │  │ & Anims  │  │ & Controls   │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│           ↕ OffscreenCanvas Worker              │
├─────────────────────────────────────────────────┤
│                Streaming Layer                   │
│  SSE transport → token-by-token rendering       │
│  Skeleton screens → typing indicators           │
│  Interrupt/cancel support                        │
├─────────────────────────────────────────────────┤
│                 AI Backend                       │
│  OpenAI Responses API (stream: true)            │
│  Function calling for draw operations           │
│  Structured JSON output for shape definitions   │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions
1. **Canvas 2D** for drawing (with OffscreenCanvas for perf), **SVG** for annotations/animations
2. **SSE streaming** with skeleton screens for latency masking
3. **Discriminated unions** for all tool/shape/state types
4. **Suggestion chips** (Apple-style, max 3-4) for next actions
5. **Progressive disclosure** — show drawing steps as they generate
6. **Conversation + artifact** model (à la Claude Artifacts)

---

## Reference Links

### Existing Solutions
- https://excalidraw.com
- https://tldraw.com
- https://openai.com/index/introducing-canvas/
- https://openalternative.co/compare/excalidraw/vs/tldraw
- https://www.libhunt.com/compare-tldraw-vs-excalidraw

### Drawing Animation
- https://www.svgai.org/blog/svg-path-animation-tutorial
- https://css3shapes.com/animating-svg-paths-with-css/
- https://www.cassie.codes/posts/creating-my-logo-animation/
- https://www.svgator.com/tutorials/create-stroke-animations

### Latency Masking
- https://dev.to/pockit_tools/the-complete-guide-to-streaming-llm-responses-in-web-applications
- https://ai-sdk.dev/docs/foundations/streaming (Vercel AI SDK)
- https://makeaihq.com/guides/cluster/loading-states-skeleton-screens-chatgpt
- https://ui-deploy.com/blog/skeleton-screens-improving-perceived-performance

### Voice UI
- https://design.google/library/speaking-the-same-language-vui
- https://ui-deploy.com/blog/voice-user-interface-design-patterns-complete-vui-development-guide-2025
- https://www.uxmatters.com/mt/archives/2024/11/the-future-of-voice-user-interfaces.php

### Apple Design
- https://developer.apple.com/design/human-interface-guidelines/
- https://developer.apple.com/design/human-interface-guidelines/patterns
- https://blog.logrocket.com/ux-design/redesigning-with-apple-hig-and-ai/

### Canvas/WebGL Performance
- https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- https://web.dev/articles/offscreen-canvas
- https://web.dev/articles/canvas-performance
- https://www.geeksforgeeks.org/javascript/how-to-optimize-webgl-performance/
- https://www.svggenie.com/blog/svg-vs-canvas-vs-webgl-performance-2025

### TypeScript Patterns
- https://stevekinney.com/courses/react-typescript/typescript-discriminated-unions
- https://www.holdenmonroe.com/blog/typescript-advanced-patterns
- https://www.vibecademy.ai/blog/typescript-best-practices-2024

### OpenAI Integration
- https://platform.openai.com/docs/guides/function-calling
- https://platform.openai.com/docs/api-reference/responses
