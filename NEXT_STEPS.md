# Next Steps

## Phase 1 — Complete ✅

All foundational work is done:

- [x] Project scaffolding (Next.js 15 + React 19 + TypeScript strict)
- [x] Type system with branded types (`Coordinate`, `ShapeId`, `PositivePx`, etc.)
- [x] Zustand stores (whiteboard + conversation)
- [x] Canvas rendering engine with shape renderers (rectangle, ellipse, line, arrow, freehand, text)
- [x] OpenAI streaming integration (SSE, tool call parsing, DrawToolLoop)
- [x] Performance layer (StreamingDrawController, SkeletonRenderer, 60fps budget)
- [x] Voice interaction mode (state machine, Web Speech API hooks)
- [x] Text interaction mode (chat panel, message history)
- [x] Font management for handwritten text
- [x] Selection system with spatial indexing
- [x] Layer management
- [x] Rate limiting for API routes
- [x] 253 tests passing (13 test files)
- [x] 0 TypeScript errors, 0 ESLint errors
- [x] Production build succeeds (102kB First Load JS)
- [x] 14 specification documents

## Phase 2 — Recommended Next Work

### High Priority

1. **Wire up canvas rendering to DOM** — Connect the rendering engine to an actual `<canvas>` element with pointer event handling, camera pan/zoom, and DPR-aware sizing.

2. **Connect OpenAI API key** — Set `OPENAI_API_KEY` in `.env.local` and test end-to-end drawing flow with a real API call.

3. **Implement undo/redo** — Add history stack to the whiteboard store with keyboard shortcuts (Cmd+Z / Cmd+Shift+Z).

4. **Add error boundaries** — Wrap canvas and chat panels in React error boundaries with fallback UI.

### Medium Priority

5. **Persist drawings** — Save/load whiteboard state to localStorage or a database (IndexedDB for offline, Postgres for cloud).

6. **Export functionality** — Export canvas as PNG/SVG via `canvas.toBlob()` / SVG serialization.

7. **Dark mode** — Wire up Tailwind v4 dark mode with system preference detection.

8. **Mobile touch support** — Add touch event handlers alongside pointer events; pinch-to-zoom.

### Lower Priority

9. **Real-time collaboration** — WebSocket server for multi-user editing with CRDT or OT for conflict resolution.

10. **Additional AI capabilities** — Image generation (DALL·E), diagram auto-layout, style transfer.

11. **Accessibility** — Keyboard navigation for toolbar/panels, screen reader announcements for drawing actions, high-contrast mode.

12. **CI/CD pipeline** — GitHub Actions workflow for type-check → lint → test → build on PRs.

## Known Limitations

- **1 ESLint warning** — `react-hooks/exhaustive-deps` in `useOpenAIStream.ts:190` (intentional: `processSSEEvent` is defined after the hook that references it). Can be suppressed if desired.
- **No database** — All state is in-memory. Refreshing the page loses drawings.
- **No authentication** — API routes are open. Add auth middleware before deploying.
- **Voice mode requires HTTPS** — Web Speech API needs a secure context in production.
- **OpenAI SDK version** — Using v6.22 with the Responses API. Monitor for breaking changes.
