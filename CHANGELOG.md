# Changelog

All notable changes to AgentsLeague — the AI-powered collaborative whiteboard.

## [0.1.0] — 2025-07-25

### Core Architecture
- **Type System**: Branded types (`PositivePx`, `UnitFloat`, `HSLA`), Zod validation schemas, and type guards for runtime safety
- **State Machine**: Finite state machines for whiteboard states (`idle → processing → drawing → complete`) and voice states (`idle → listening → transcribing → sending`)
- **Store Layer**: Zustand stores for conversation, drawing session, and whiteboard state with real-time sync

### AI Integration
- **OpenAI Client**: Streaming SSE connection to GPT-4o with tool-use (`draw()` function)
- **Draw Tool Schema**: Zod-validated `DrawToolArgs` with canvas dimensions, element specs, and styles
- **Streaming Parser**: Real-time SSE parsing with partial spec rendering, error recovery, and abort support
- **Chat API** (`/api/chat`): Server-side chat completions with streaming responses
- **Draw API** (`/api/draw`): Server-side drawing generation with iterative refinement loop
- **Health API** (`/api/health`): Health check endpoint

### Canvas & Rendering
- **WhiteboardCanvas**: Multi-layer HTML5 Canvas (background, content, UI, interaction layers)
- **Renderer**: Dirty-rect rendering, spatial indexing (R-tree via rbush), element caching, and performance monitoring
- **Drawing Tools**: Rectangle, ellipse, line, path, text, arrow, image, and group elements
- **Selection System**: Click/lasso selection, multi-select, bounding box handles
- **Undo/Redo**: Command pattern history with `MoveCommand` and `PropertyChangeCommand`
- **Export**: PDF export via `pdf-lib`, PNG rasterization
- **Touch Gestures**: Pinch-to-zoom, two-finger pan, three-finger undo

### Text & Fonts
- **FontManager**: Preloads handwritten fonts with fallback chain
- **Text Rendering**: Jitter-based handwritten effect, animated stroke, and baseline alignment
- **TextOverlay**: In-place text editing with keyboard shortcuts

### Interaction Modes
- **Text Mode**: Type messages → AI responds with SSE stream → drawing appears on canvas
- **Voice Mode**: Web Speech API recognition → Whisper transcription → AI drawing → optional TTS output
- **Mode Toggle**: Animated sliding indicator with ARIA radiogroup

### UI Components
- **ChatPanel**: Message bubbles, code blocks, typing dots, drawing progress indicator, reasoning sections
- **Toolbar**: Tool selection, undo/redo, clear, zoom controls, mode toggle, dark mode, settings
- **TextInput**: Auto-resizing textarea with character count, keyboard shortcuts (Ctrl+Enter to send)
- **VoiceIndicator**: Animated waveform, transcript display, confidence badge
- **ModeToggle**: Text/Voice mode switcher with animated indicator
- **ToastContainer**: Error/success notifications with auto-dismiss
- **PropertyPanel**: Element property editor (position, size, style)

### Design System
- **Theme Tokens**: HSL-based CSS custom properties for light/dark modes (25+ color tokens)
- **Dark Mode**: System preference detection, manual toggle, localStorage persistence
- **Responsive Design**: Mobile-first with `sm`/`md`/`lg` breakpoints, fluid typography via `clamp()`
- **Accessibility**: WCAG AA compliance, ARIA labels/roles, keyboard navigation, focus indicators, skip links, reduced motion support
- **Touch Targets**: 44×44px minimum on coarse pointer devices

### Performance
- **Bundle Size**: 131 KB First Load JS (main page), 102 KB shared
- **Rendering**: Dirty-rect tracking, element caching, requestAnimationFrame batching
- **API**: Request deduplication, debounced streaming, abort controller cleanup
- **Fonts**: Async preloading with fallback display

### Testing
- **Unit Tests**: 539 tests across 24 test files — 100% pass rate
- **Test Infrastructure**: Vitest + Testing Library + jsdom, mock utilities for Canvas, OpenAI, Speech Recognition
- **Integration Tests**: Text mode flow, voice mode flow, mode switching, undo/redo, error recovery
- **Component Tests**: ChatPanel, Toolbar, TextInput, ModeToggle, VoiceIndicator, WhiteboardCanvas
- **E2E Tests**: Playwright tests for full user scenarios, voice mode, canvas interaction, dark mode, mobile responsive, performance budgets

### Developer Experience
- **TypeScript Strict Mode**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, zero errors
- **ESLint**: Strict rules with zero errors
- **Prettier**: Consistent formatting with Tailwind CSS plugin
- **Husky + lint-staged**: Pre-commit hooks for lint and format checks
- **Bundle Analyzer**: `npm run analyze` for bundle inspection
