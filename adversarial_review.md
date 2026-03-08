# Executive Summary (Top 10 Critical Findings)

1. **SEC-001 — Missing auth/authz on mutation endpoints** (`src/app/api/agent/stream/route.ts`, planned `/api/whiteboard/inject`): unauthenticated callers can invoke expensive model+mutation paths.
2. **SEC-002 — Session binding + replay protection absent** (`src/lib/schema.ts`, `route.ts`, `plan.md`): attacker-controlled `sessionId` enables hijack/replay unless server-authoritative binding is added.
3. **SEC-003 — Rate limit bypass via header rotation** (`route.ts:594-601`, `api-middleware.ts:176-240`): limiter keyed to `X-Session-Id` is attacker-controlled.
4. **SEC-004 — Oversized batch DoS via normalization bypass** (`tool-handler.ts:214-252`, `schema.ts:403-506`): post-normalization batch is not revalidated against `DrawBatchSchema.max(200)`.
5. **SEC-005 — CSRF protection not enforced for mutating routes** (`plan.md:65-93`, `api-middleware.ts`, `csrf-protection.ts` unused): cross-site state-changing requests remain possible in cookie-auth deployments.
6. **STATE-001 — No global mutation sequencer across SSE + inject** (`route.ts activeStreams`, `AppShell.tsx:231-266`): concurrent writes can interleave and corrupt deterministic scene ordering.
7. **ARCH-001 — REST inject reusing SSE-centric `handleToolCall` is a contract mismatch** (`tool-handler.ts`, `route.ts`, `plan.md`): brittle adapters and hidden refactor scope risk.
8. **PLAN-001 — Wave-order contradictions (delete vs later reuse)** (`plan.md`, synthesis artifacts): execution can delete files required in subsequent waves.
9. **TYPE-001 — DrawElement union expansion without exhaustive migration controls** (`types/agent.ts` + renderer/planner/export switches): silent drops/fallthrough regressions likely.
10. **MATH-001 — Function/integral correctness gaps for discontinuities/intersections** (`planned lowerers`): current heuristics can render mathematically wrong output (bridges, wrong shaded lobes).

---

## CRITICAL Issues (must fix before implementation)

### SEC-001 — Missing authentication/authorization on whiteboard mutation/model routes
- **Issue ID:** SEC-001
- **Summary:** Unauthenticated callers can trigger model streaming and canvas mutation.
- **Affected file(s):** `src/app/api/agent/stream/route.ts`; planned `src/app/api/whiteboard/inject/route.ts` (from `plan.md`); `plan.md` API sections.
- **Detailed description:** Group C (C7) and security groups identify no enforced authz boundary; session IDs are client-supplied and not bound to principal ownership.
- **Recommended fix:** Add mandatory auth middleware now; derive authoritative session/user server-side; enforce resource ownership checks before parse/model/tool execution.

### SEC-002 — Session hijack/replay risk due to weak session semantics
- **Issue ID:** SEC-002
- **Summary:** `sessionId` is caller-controlled and replayable without nonce/idempotency constraints.
- **Affected file(s):** `src/lib/schema.ts` (`AgentStreamRequestSchema`), `src/app/api/agent/stream/route.ts`, planned inject route (`plan.md`).
- **Detailed description:** Group C (C2) shows optional/loose inject semantics and no anti-replay window; captured payloads can be replayed into arbitrary sessions.
- **Recommended fix:** Require signed/idempotent request metadata (`X-Idempotency-Key`, nonce, timestamp TTL), bind session to authenticated principal, reject duplicates/stale requests.

### SEC-003 — Rate-limit bypass by rotating `X-Session-Id`
- **Issue ID:** SEC-003
- **Summary:** Per-key limiter is bypassable because key source is attacker-controlled header.
- **Affected file(s):** `src/app/api/agent/stream/route.ts:594-601`; `src/lib/server/api-middleware.ts:176-240`.
- **Detailed description:** Group A2 (A6) demonstrated 100 req/min bypass by changing header per request while reusing victim body session.
- **Recommended fix:** Key rate limits to trusted identity + IP; enforce header/body binding; add global breaker and new-key creation guardrails.

### SEC-004 — Oversized DrawBatch DoS through normalization path
- **Issue ID:** SEC-004
- **Summary:** Invalid raw payload can normalize into oversized batch and bypass max-element schema cap.
- **Affected file(s):** `src/lib/server/stream/tool-handler.ts:214-252`; `src/lib/schema.ts:403-506`; `src/lib/whiteboard/planner/constraints.ts:243-390`.
- **Detailed description:** Group A2 (A8) found post-normalization output is not revalidated; expensive O(n²) constraint work and large hash allocations follow.
- **Recommended fix:** Re-parse normalized batch with `DrawBatchSchema.safeParse`; enforce hard length caps during normalization; apply compute budget before constraints.

### SEC-005 — CSRF protection missing for state-changing APIs
- **Issue ID:** SEC-005
- **Summary:** Planned and existing POST routes lack CSRF middleware/origin checks.
- **Affected file(s):** `plan.md:65-93`; `src/lib/server/api-middleware.ts`; `src/lib/security/csrf-protection.ts` (unused); `src/app/api/agent/stream/route.ts`.
- **Detailed description:** Group A (A2) shows side-effectful POSTs can be triggered cross-site once cookies are in play.
- **Recommended fix:** Add Origin/Referer allowlist + token validation to all mutating endpoints; fail closed pre-parse.

### STATE-001 — No deterministic cross-channel mutation ordering
- **Issue ID:** STATE-001
- **Summary:** SSE tool batches and future inject batches can interleave nondeterministically.
- **Affected file(s):** `src/app/api/agent/stream/route.ts:51,152,159,582`; `src/components/app/AppShell.tsx:231-266`; planned inject API.
- **Detailed description:** Groups C/H (C3, H1, H4, H8) show `activeStreams` protects only one route and no monotonic sequence exists across channels.
- **Recommended fix:** Introduce per-session server sequencer/queue; attach `sequenceNumber`; client reducer buffers/applies in-order; return `409` on stale writes.

### ARCH-001 — Reusing SSE-centric `handleToolCall` for REST inject is high-risk
- **Issue ID:** ARCH-001
- **Summary:** Transport semantics mismatch (SSE lifecycle vs synchronous JSON endpoint) will create brittle adapters.
- **Affected file(s):** `src/lib/server/stream/tool-handler.ts`; `src/app/api/agent/stream/route.ts`; `plan.md` inject design.
- **Detailed description:** Group B (B4) + Group C (C10) indicate hidden coupling to SSE event/error/diagnostic flows.
- **Recommended fix:** Extract transport-agnostic mutation core service; keep route handlers thin adapters with shared schema/error contracts.

### PLAN-001 — Plan wave contradictions (delete-now vs reuse-later)
- **Issue ID:** PLAN-001
- **Summary:** File lifecycle conflicts make execution order unsafe.
- **Affected file(s):** `plan.md`; synthesis wave artifacts referencing `canvas-fallback`, `render-frame-guard`, `render-metrics-collector`, geometry bounds files.
- **Detailed description:** Group B (B10 + meta-risk) and Group E (E2/E8) confirm contradictory decisions and hidden barrel dependencies.
- **Recommended fix:** Publish one authoritative file lifecycle manifest (`delete|keep|refactor|wire`) with dependency DAG; prohibit deletion until downstream consumers resolved.

### TYPE-001 — DrawElement union expansion without exhaustive handling plan
- **Issue ID:** TYPE-001
- **Summary:** Adding math primitives can silently break non-exhaustive render/planner/export switches.
- **Affected file(s):** `src/types/agent.ts` (planned updates), renderer/planner/export consumers across `src/lib/whiteboard/**`, `src/components/whiteboard/**`.
- **Detailed description:** Group B (B6) and Group J (J5/J10) flag additive type regressions and mixed-mode ambiguity.
- **Recommended fix:** Census all discriminated union consumers, enforce `never` exhaustiveness, add provenance metadata (`source`, `originId`), and explicit mixed-batch conflict policy.

### MATH-001 — Discontinuity + multi-intersection math rendering correctness failures
- **Issue ID:** MATH-001
- **Summary:** Current planned heuristics can render mathematically incorrect function and area plots.
- **Affected file(s):** Planned math lowerers/constraints in `plan.md` (FunctionCurve, IntegralRegion).
- **Detailed description:** Group D (D2, D6) shows `|Δy|` splitting and naive polygon construction produce asymptote bridging and wrong shaded regions.
- **Recommended fix:** Segment on non-finite/domain breaks + slope criteria; compute intersections; fill per interval as simple polygons with robust winding/even-odd logic.

### UX-001 — Accessibility gap for canvas semantics
- **Issue ID:** UX-001
- **Summary:** Visual canvas has controls but lacks semantic non-visual representation.
- **Affected file(s):** `src/components/whiteboard/WhiteboardCanvas.tsx`; `src/components/app/AppShell.tsx`; plan UX sections.
- **Detailed description:** Group J (J4) identifies `role="application"` without equivalent scene narration/navigation.
- **Recommended fix:** Add accessible scene outline, ARIA-live structural updates, keyboard element traversal/edit model, and role strategy aligned to actual keyboard semantics.

---

## HIGH Issues (should fix in implementation)

### SEC-006 — Unbounded finite coordinates allow precision/perf abuse
- **Issue ID:** SEC-006
- **Summary:** `finite()` blocks NaN/Infinity but accepts pathological huge values.
- **Affected file(s):** `src/lib/schema.ts:18-29,46-55`; `src/lib/whiteboard/clamp-coordinates.ts` (unused); `constraints.ts:360-406`.
- **Detailed description:** Group A (A3) notes clamp utility is not in runtime path.
- **Recommended fix:** Add schema min/max bounds and mandatory clamp pass pre-planner.

### SEC-007 — Cumulative flooding remains possible despite per-request caps
- **Issue ID:** SEC-007
- **Summary:** Repeated legal batches can create memory/CPU exhaustion.
- **Affected file(s):** `src/lib/schema.ts:76-80`; `src/components/app/AppShell.tsx:235-265,490-529`; `WhiteboardCanvas.tsx:28,450-453`.
- **Detailed description:** Group A (A4) shows per-request limits are insufficient without session-level quotas.
- **Recommended fix:** Add cumulative per-session quotas and cost-based throttling (elements/sec, points/sec).

### API-001 — Mixed transport contract and divergent errors (SSE vs JSON)
- **Issue ID:** API-001
- **Summary:** Two mutation transports without unified envelope/error schema increase bug surface.
- **Affected file(s):** `src/app/api/agent/stream/route.ts`; planned `/api/whiteboard/inject`; client API hooks.
- **Detailed description:** Group C (C1, C4) highlights duplicate processing stacks and inconsistent retry telemetry.
- **Recommended fix:** Standardize `ApiResult<T>` envelope + canonical machine-readable error shape across transports.

### API-002 — Missing API versioning before expansion
- **Issue ID:** API-002
- **Summary:** Evolving contracts without versioning will create avoidable breakage.
- **Affected file(s):** API route namespace in `src/app/api/**`; `plan.md` API design.
- **Detailed description:** Group C (C5) and Group J (J9) identify schema evolution risk.
- **Recommended fix:** Introduce `/api/v1` (or media-type versioning) now with compatibility policy/tests.

### API-003 — Route cohesion risk in oversized stream route
- **Issue ID:** API-003
- **Summary:** `route.ts` already handles too many responsibilities.
- **Affected file(s):** `src/app/api/agent/stream/route.ts` (600+ LOC).
- **Detailed description:** Group C (C10) warns adding inject logic here creates a god-route.
- **Recommended fix:** Extract injection service, mutation queue, protocol-error modules; keep handlers thin.

### PLAN-002 — Dead-code deletion validation method is too weak
- **Issue ID:** PLAN-002
- **Summary:** grep-only checks miss alias/re-export/dynamic paths.
- **Affected file(s):** `plan.md`; deletion scripts/process; `tsconfig.json` alias usage.
- **Detailed description:** Groups B/E (B1, B7, E7, E8) recommend resolver-based graph checks and staged canary deletes.
- **Recommended fix:** Replace grep proof with static resolver graph + dynamic import scan + batchwise canary deletes with rollback lists.

### PLAN-003 — Geometry consolidation has high blast radius
- **Issue ID:** PLAN-003
- **Summary:** Bounds consolidation touches central fanout modules with hidden regression risk.
- **Affected file(s):** `src/lib/whiteboard/element-bounds.ts`; `src/lib/whiteboard/planner/bounds.ts`; downstream planner consumers.
- **Detailed description:** Groups B/E (B2, E2) show current production imports and behavioral coupling.
- **Recommended fix:** Inventory all callsites first; use visual goldens + numeric tolerance checks before cutover.

### RENDER-001 — DPR-change blur bug
- **Issue ID:** RENDER-001
- **Summary:** Device pixel ratio changes without resize can leave blurry backing stores.
- **Affected file(s):** `src/components/whiteboard/WhiteboardCanvas.tsx` resize flow.
- **Detailed description:** Group F (F4) found no explicit pure-DPR change trigger.
- **Recommended fix:** Add DPR listeners/polling trigger and force canvas resize+redraw on change.

### RENDER-002 — Silent content loss from committed stroke cap
- **Issue ID:** RENDER-002
- **Summary:** `MAX_COMMITTED=2000` truncates history and may hide early work.
- **Affected file(s):** `WhiteboardCanvas.tsx` committed slicing logic.
- **Detailed description:** Group F (F6) notes inconsistent behavior vs reduced-motion path.
- **Recommended fix:** Replace with archival/compaction strategy + explicit user warning and consistent policy.

### EXPORT-001 — Export resource/OOM risk at high scales
- **Issue ID:** EXPORT-001
- **Summary:** Side-length cap alone does not prevent area-based memory failures.
- **Affected file(s):** planned export implementation (`synth-03-export` design); export API route design.
- **Detailed description:** Group G (G3, G9, G10) flags missing pixel budget/body-size/point-count guards.
- **Recommended fix:** Add max pixel budget, adaptive scale-down/tiling, strict payload limits, and early rejection before heavy parse/render.

### EXPORT-002 — Transparent/white-background behavior inconsistent across export paths
- **Issue ID:** EXPORT-002
- **Summary:** quick compositing path can force opaque output despite transparent option.
- **Affected file(s):** planned export compositing pipeline (`bg + committed + active`).
- **Detailed description:** Group G (G4) found mismatch between re-render and layer-composite semantics.
- **Recommended fix:** Define one canonical compositing policy and enforce option parity in every export mode.

### MATH-002 — Dense lowering can collapse performance and truncate correctness
- **Issue ID:** MATH-002
- **Summary:** Many tiny segments + 60-element cap can cause jank and silent truncation.
- **Affected file(s):** planned lowerers and `DEFAULT_MAX_LOWERED_ELEMENTS`; rendering hot paths.
- **Detailed description:** Group D (D3) highlights segment-heavy draw cost and implicit truncation tradeoff.
- **Recommended fix:** Introduce polyline/path primitives, style-batched rendering, LOD degradation, and explicit truncation diagnostics.

### MATH-003 — Angle arc directionality/mode ambiguity
- **Issue ID:** MATH-003
- **Summary:** `startAngle/endAngle` alone cannot represent cw/ccw and major/minor intent.
- **Affected file(s):** planned `AngleArc` schema/lowerer.
- **Detailed description:** Group D (D7) shows wrap-around label placement errors.
- **Recommended fix:** Add `direction` + `arcMode`/`sweepDegrees` and normalize robustly.

### MATH-004 — GeometryProof and axes layout overflow risks
- **Issue ID:** MATH-004
- **Summary:** Current proposed layout contracts can clip/overlap long labels/content.
- **Affected file(s):** planned `CartesianAxesElement`, `GeometryProof` rendering/layout rules.
- **Detailed description:** Group D (D1, D8) finds missing min-size + text measurement/wrapping/pagination logic.
- **Recommended fix:** Add measured layout engine, min dimensions, collision-aware label decimation, and continuation behavior.

### UX-002 — Injector placement and mobile surface model are misaligned
- **Issue ID:** UX-002
- **Summary:** Putting injector in chat footer creates mental-model confusion and mobile crowding.
- **Affected file(s):** `src/components/app/AppShell.tsx`; planned injector UX.
- **Detailed description:** Group J (J2, J3) recommends treating injector as whiteboard tool/surface.
- **Recommended fix:** Move injector to whiteboard tools modal/drawer; implement mobile 3-state surface model (`canvas|chat|tools`).

---

## MEDIUM Issues (address in later waves)

### STATE-002 — Unmount cleanup does not abort active stream
- **Issue ID:** STATE-002
- **Summary:** Active network stream may continue after component teardown.
- **Affected file(s):** `src/hooks/useAgentStream.ts:159-162`.
- **Detailed description:** Group H (H3) confirmed missing abort in unmount cleanup.
- **Recommended fix:** Abort and clear controller in effect cleanup.

### STATE-003 — Undo/redo transaction semantics for streamed batches undefined
- **Issue ID:** STATE-003
- **Summary:** Undo may target partial/provisional AI output mid-turn.
- **Affected file(s):** `src/components/app/AppShell.tsx`; stream batch event handling; plan hooks-state section.
- **Detailed description:** Group H (H5) calls for turn-atomic command boundary.
- **Recommended fix:** Treat one turn as compound command; block/defer undo until `turn.done`.

### STATE-004 — Long-session memory retention without compaction
- **Issue ID:** STATE-004
- **Summary:** Scene/batch history can grow unbounded in active chats.
- **Affected file(s):** `AppShell.tsx` batches storage; persistence layer usage.
- **Detailed description:** Group H (H7) identifies memory pressure risk independent of message virtualization.
- **Recommended fix:** Add retention+checkpoint compaction policy.

### API-004 — Content-Type enforcement is permissive
- **Issue ID:** API-004
- **Summary:** substring CT checks are weaker than strict media-type parsing.
- **Affected file(s):** `src/lib/server/api-middleware.ts` (`withContentType`).
- **Detailed description:** Group C (C9) recommends strict JSON policy and explicit 415 behavior tests.
- **Recommended fix:** Parse and validate exact media type + charset and reject ambiguous/multipart payloads.

### API-005 — Dual heartbeat sources in SSE route
- **Issue ID:** API-005
- **Summary:** duplicate keepalive timers add reliability complexity.
- **Affected file(s):** `src/app/api/agent/stream/route.ts` heartbeat setup.
- **Detailed description:** Group C (C8) identified two heartbeat mechanisms.
- **Recommended fix:** Keep one heartbeat implementation with lifecycle tests.

### API-006 — Draw vs semantic injection mode ambiguity
- **Issue ID:** API-006
- **Summary:** inject design unclear on accepted payload mode and diagnostics.
- **Affected file(s):** `plan.md`; planned inject schema/service.
- **Detailed description:** Group C (C6) notes mixed docs and code-path uncertainty.
- **Recommended fix:** Use explicit discriminated union (`mode: draw|semantic`) with mode-specific outputs.

### PROMPT-001 — Prompt length expansion lacks budgeting/tiering
- **Issue ID:** PROMPT-001
- **Summary:** longer prompt raises per-iteration cost and context pressure.
- **Affected file(s):** `src/lib/server/openai.ts`; `src/app/api/agent/stream/route.ts` iteration loop.
- **Detailed description:** Groups B/I (B9, I1, I5) quantify overhead multiplying across up to 6 iterations.
- **Recommended fix:** Prompt tiers (full/standard/lite), conditional suffixes, token telemetry guardrails.

### PROMPT-002 — Prompt injection defenses are partial
- **Issue ID:** PROMPT-002
- **Summary:** injection guard exists but is not wired into runtime prompt assembly path.
- **Affected file(s):** `src/lib/whiteboard/planner/injection-guard.ts`; `src/app/api/agent/stream/route.ts` input assembly.
- **Detailed description:** Group I (I3) found defense mostly reliant on prompt precedence + post-generation schema.
- **Recommended fix:** integrate guard at input assembly and semantic text entry points; add jailbreak regression tests.

### PROMPT-003 — Coordinate guidance mismatch with runtime world/camera model
- **Issue ID:** PROMPT-003
- **Summary:** fixed-size prompt guidance conflicts with dynamic viewport/camera implementation.
- **Affected file(s):** prompt docs (`synth-07`), `WhiteboardCanvas.tsx`, planner constants.
- **Detailed description:** Group I (I4) notes mismatch (prompt ~1400x900 vs planner 1600x1200 world assumptions).
- **Recommended fix:** rewrite guidance around world coordinates + camera viewport.

### PROMPT-004 — Model-family prompt calibration absent
- **Issue ID:** PROMPT-004
- **Summary:** single prompt variant across model families is brittle.
- **Affected file(s):** `src/lib/server/openai.ts` model/prompt wiring.
- **Detailed description:** Group I (I6) flags behavior divergence across GPT/Claude/Gemini-style models.
- **Recommended fix:** shared core policy + per-model variants, benchmark matrix before rollout.

### EXPORT-003 — Viewport vs full-content export semantics unclear
- **Issue ID:** EXPORT-003
- **Summary:** SVG/export currently world-space; users may expect camera WYSIWYG export.
- **Affected file(s):** planned export functions (`exportStrokesToSVG`, camera-aware UI flows).
- **Detailed description:** Group G (G2) recommends explicit mode split.
- **Recommended fix:** expose explicit “Viewport snapshot” vs “Full content” export options.

### RENDER-003 — Concurrent active batch animations reduce readability
- **Issue ID:** RENDER-003
- **Summary:** rapid batch arrivals overlap easings and create chaotic multi-pen effect.
- **Affected file(s):** stroke scheduler and active batch start timing.
- **Detailed description:** Group F (F9) suggests controlled concurrency/staggering.
- **Recommended fix:** Add scheduler concurrency cap and optional serialized pedagogy mode.

### ARCH-002 — AppShell growth threatens maintainability
- **Issue ID:** ARCH-002
- **Summary:** single large orchestrator component is scaling bottleneck.
- **Affected file(s):** `src/components/app/AppShell.tsx` (~760 LOC); `src/app/page.tsx`.
- **Detailed description:** Group J (J1, J8) recommends route/store decomposition with vertical-slice delivery.
- **Recommended fix:** Introduce route/layout boundaries and domain state modules before major new surfaces.

---

## LOW / Informational

### SEC-008 — Draw text/tex payloads are unsanitized at ingress (future sink risk)
- **Issue ID:** SEC-008
- **Summary:** not immediately exploitable in current canvas path, but dangerous for future HTML/SVG sinks.
- **Affected file(s):** `src/lib/schema.ts:44-57,66-80`; `tool-handler.ts`; `plan.md:146-151,707-710`.
- **Detailed description:** Group A (A1) shows payload persistence without canonical sanitization.
- **Recommended fix:** sanitize/encode `text`/`tex` at ingress and keep regression tests for future sinks.

### SEC-009 — Regex/ReDoS review found no catastrophic backtracking in reviewed patterns
- **Issue ID:** SEC-009
- **Summary:** negative finding; only hardening needed.
- **Affected file(s):** `provisional.ts`, `bounds.ts`, sanitizers.
- **Detailed description:** Group A2 (A7) found no production catastrophic regex.
- **Recommended fix:** keep perf tests and input length caps.

### SEC-010 — SSRF sink not found in reviewed drawing/LaTeX pipeline
- **Issue ID:** SEC-010
- **Summary:** negative finding with defense-in-depth recommendations.
- **Affected file(s):** `mathjax-client.ts`, `server/mathjax.ts`, `/api/latex/svg` route.
- **Detailed description:** Group A2 (A9) found no user-controlled outbound URL fetch on server path.
- **Recommended fix:** keep URL allowlist policy for any future outbound calls.

### SEC-011 — Prototype pollution sink not found in production path
- **Issue ID:** SEC-011
- **Summary:** current field-by-field normalization mitigates classic pollution vector.
- **Affected file(s):** `src/lib/schema.ts` normalization path; no production unsafe merges detected.
- **Detailed description:** Group A2 (A10) is informational with guardrail suggestions.
- **Recommended fix:** add regression tests for `__proto__/constructor/prototype` keys.

### DEAD-001 — 55-file delete set is currently truly unimported in production
- **Issue ID:** DEAD-001
- **Summary:** resolver-based scan confirmed zero production importers for the declared safe list.
- **Affected file(s):** 55 modules listed in synth dead-code set.
- **Detailed description:** Group E (E1) validated claim, contradicting earlier uncertainty.
- **Recommended fix:** enforce same resolver check in CI before deletion merges.

### EXPORT-004 — Clipboard path lacks auto-fallback ergonomics in insecure contexts
- **Issue ID:** EXPORT-004
- **Summary:** user feedback exists but no automatic one-click download fallback.
- **Affected file(s):** planned clipboard export flow.
- **Detailed description:** Group G (G7) notes repeated failure loops in HTTP dev/permission-blocked contexts.
- **Recommended fix:** detect insecure context/permissions early and offer immediate download fallback.

### RENDER-004 — Catmull-Rom straight-line drift is future-facing
- **Issue ID:** RENDER-004
- **Summary:** risk manifests if smooth-stroke path is made global.
- **Affected file(s):** `src/lib/whiteboard/canvas-draw.ts` (`drawSmoothStroke`).
- **Detailed description:** Group F (F1) marks current production impact as latent.
- **Recommended fix:** add straightness gate before spline conversion.

### RENDER-005 — Browser API compatibility baseline is currently conservative/safe
- **Issue ID:** RENDER-005
- **Summary:** reviewed Canvas API usage is Safari-safe in current files.
- **Affected file(s):** `WhiteboardCanvas.tsx`, `canvas-draw.ts`.
- **Detailed description:** Group F (F10) found no problematic modern-only APIs in current hot path.
- **Recommended fix:** maintain feature detection if adding newer APIs.

---

## Required Plan Amendments

Ordered by impact (must be reflected in `plan.md` before implementation proceeds):

1. **Security gate before feature work:** add explicit prerequisite wave requiring authn/authz, session binding, CSRF, replay/idempotency, and trusted rate-limit keys.
2. **Single mutation pipeline contract:** define transport-agnostic core mutation service + shared sequencer used by SSE and inject; prohibit direct REST reuse of SSE internals.
3. **Authoritative wave/file lifecycle manifest:** reconcile all delete/refactor/reuse conflicts; include dependency DAG and “no-delete-until-consumer-migrated” rule.
4. **Schema evolution policy:** add `schemaVersion` for batch/session payloads, migration registry, and unknown-type fallback behavior.
5. **Union expansion safety checklist:** require exhaustive-switch audit and telemetry-backed fallback for unsupported/new types before adding math primitives.
6. **Math correctness specification:** formalize discontinuity handling, intersection splitting, angle sweep semantics, and layout measurement requirements before coding lowerers.
7. **Export hardening section:** add pixel/body/point budgets, tainted-canvas fallback, and explicit viewport-vs-full-content modes.
8. **Prompt governance:** move to tiered prompt strategy (core + task suffixes + lite mode), model-family calibration, and fixture validation of prompt examples.
9. **State integrity controls:** add turn-atomic undo policy, stream abort-on-unmount requirement, and long-session retention/compaction strategy.
10. **Architecture/UX guardrails:** move injector to whiteboard tools surface, define mobile `canvas|chat|tools` state machine, and include accessibility companion model deliverable.

---

## Confirmed Safe

1. **No catastrophic ReDoS found** in reviewed production regex patterns (A7).
2. **No direct SSRF sink identified** in reviewed drawing/LaTeX server pipeline (A9).
3. **No current prototype-pollution sink found** in production normalization/merge paths (A10).
4. **LaTeX SVG chat rendering is sanitized before DOM insertion** and strips dangerous tags/handlers (A5).
5. **55-file dead-code candidate set is genuinely unimported by production** under resolver-based analysis (E1).
6. **Several targeted rendering/geometry helper modules are test-only consumers today** (E3), making removal feasible with coordinated test migration.
7. **Refresh persistence is implemented** via localStorage + migrations (`useSessionManager`/`persistence`) (H6).
8. **Current whiteboard text path mostly avoids `measureText` pitfalls** by converting math/text to vector strokes (F7).
9. **Current canvas API usage is broadly cross-browser safe (including Safari)** in reviewed rendering files (F10).
10. **World-space full-content export logic is conceptually present** for non-viewport exports (G6), though guardrails are still needed.

---

**Adversarial Score: 56/100**
