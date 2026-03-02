# Round 1 Consensus Synthesis (Coordinator)

Generated from reviewer critiques in:
`/Users/nb29255/Desktop/GitHubRepos/AgentsLeague_worktrees/agent-*/orchestration/reviews/round1-critique.md`

## Aggregate Result
- Reviewer decisions: `10/10 NO-GO`
- Readiness scores observed: `58..68` (average `63` across 9 explicit scores)
- Interpretation: strategic direction is aligned, but execution contracts are not yet unified.

## Canonical Decisions Locked For Round 2
1. Runtime host: use a long-lived Node worker process as the control plane for autonomy (not request-bound UI or per-request route loops).
2. UI role: observer/monitor only; no autonomous scheduling authority in `AppShell`.
3. Existing primitives: keep `/api/agent/stream` and current whiteboard planner stack as execution primitives.
4. Quality gating order:
- Tier 1 deterministic gates (always on) first.
- Tier 2 model-judge gates (sampled/nightly) second.
- Deterministic gate failure is hard fail; model gate is advisory until calibrated.
5. Visual evaluation protocol: fixed viewport, fixed settle point (post `turn.done` + render settle), deterministic artifact naming, reproducible capture path.
6. Anti-template enforcement: mandatory novelty policy with explicit similarity metrics and thresholded rejection/regeneration.
7. Persistence: append-only event log plus periodic checkpoint snapshots, with versioned schemas and idempotent replay rules.
8. Operations safety: mandatory budget caps, retry ceilings, circuit-breaker behavior, kill switch, and heartbeat watchdog.
9. Execution mode profiles:
- `smoke` (CI deterministic, short)
- `nightly` (medium endurance)
- `soak6h` (full unattended run)
10. Migration policy: staged extraction from client loop to server worker with compatibility bridge and no immediate breakage of current e2e hooks.

## Required Schema + Contract Artifacts (Must Exist in Revised Plans)
1. `Orchestrator Spec v1`
- run lifecycle states
- turn lifecycle states
- event taxonomy (`run`, `turn`, `artifact`, `incident`, `heartbeat`, `quality_score`)
- API paths + payload contracts for start/status/stop/events

2. `Metrics Dictionary v1`
- formulas, windows, and ownership for success, latency, fallback, novelty, rubric score, and stability
- baseline values + gate thresholds per execution mode

3. `Domain Benchmark Pack v1`
- biology, art, math, physics task corpus
- rubric dimensions and scoring guidance

4. `Visual Eval Spec v1`
- capture timing, viewport, artifact path format, flake policy, retry policy

5. `Anti-Template Spec v1`
- text similarity metric + threshold
- semantic-topology similarity metric + threshold
- rolling window policy and rejection behavior

6. `Recovery + Safety Spec v1`
- checkpoint frequency
- replay semantics
- duplicate-turn prevention
- failure budgets and abort conditions

## Consensus Revision Instructions for Agents
Each agent must revise its plan to include:
- one identical canonical runtime topology
- one identical gating model
- one identical run profile matrix
- one concrete implementation order with MVP cutline
- explicit GO/NO-GO checklist tied to artifacts above

Each revised plan must remove contradictory throughput targets and define one target range for each run mode.

## Round 2 Consensus Criteria
A plan is GO-ready only if all are true:
1. Includes all six spec artifacts above with concrete fields.
2. Uses the locked decisions in this document without contradiction.
3. Defines compatible run profiles and matching KPI thresholds.
4. Defines deterministic-first visual and quality gates.
5. Provides migration path from current `AppShell` behavior without breaking monitor/test hooks.
6. Includes safety policies for unattended `soak6h` operation.

If any criterion fails: `NO-GO`.
