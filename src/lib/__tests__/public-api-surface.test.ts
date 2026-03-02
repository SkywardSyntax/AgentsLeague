import { describe, expect, it } from 'vitest';

describe('Public API surface — schema', () => {
  it('exports the expected names from schema.ts', async () => {
    const mod = await import('@/lib/schema');
    expect(Object.keys(mod).sort()).toMatchInlineSnapshot(`
      [
        "AgentStreamRequestSchema",
        "DrawBatchSchema",
        "DrawElementSchema",
        "SemanticBatchSchema",
        "normalizeDrawBatchPayload",
        "normalizeSemanticBatchPayload",
      ]
    `);
  });

  it('schema runtime exports have correct types', async () => {
    const mod = await import('@/lib/schema');
    expect(typeof mod.normalizeDrawBatchPayload).toBe('function');
    expect(typeof mod.normalizeSemanticBatchPayload).toBe('function');
    expect(typeof mod.DrawElementSchema).toBe('object');
    expect(typeof mod.DrawBatchSchema).toBe('object');
    expect(typeof mod.SemanticBatchSchema).toBe('object');
    expect(typeof mod.AgentStreamRequestSchema).toBe('object');
  });
});

describe('Public API surface — geometry + stroke-scheduler', () => {
  it('exports the expected names from geometry.ts and stroke-scheduler.ts', async () => {
    const geo = await import('@/lib/whiteboard/geometry');
    expect(Object.keys(geo).sort()).toMatchInlineSnapshot(`
      [
        "MAX_SCREEN_STROKE_PX",
        "MIN_SCREEN_STROKE_PX",
        "clamp",
        "cumulativeLengths",
        "distance",
        "partialPolylineByLength",
        "resamplePolyline",
        "screenStrokePx",
        "totalLength",
      ]
    `);

    const sched = await import('@/lib/whiteboard/stroke-scheduler');
    expect(Object.keys(sched).sort()).toMatchInlineSnapshot(`
      [
        "STROKE_SPEED_PX_PER_SECOND",
        "createActiveBatch",
        "easeOutCubic",
        "strokeDurationMs",
      ]
    `);
  });

  it('geometry + scheduler runtime exports have correct types', async () => {
    const geo = await import('@/lib/whiteboard/geometry');
    expect(typeof geo.clamp).toBe('function');
    expect(typeof geo.distance).toBe('function');
    expect(typeof geo.cumulativeLengths).toBe('function');
    expect(typeof geo.totalLength).toBe('function');
    expect(typeof geo.partialPolylineByLength).toBe('function');
    expect(typeof geo.resamplePolyline).toBe('function');
    expect(typeof geo.screenStrokePx).toBe('function');
    expect(typeof geo.MIN_SCREEN_STROKE_PX).toBe('number');
    expect(typeof geo.MAX_SCREEN_STROKE_PX).toBe('number');

    const sched = await import('@/lib/whiteboard/stroke-scheduler');
    expect(typeof sched.strokeDurationMs).toBe('function');
    expect(typeof sched.createActiveBatch).toBe('function');
    expect(typeof sched.easeOutCubic).toBe('function');
    expect(typeof sched.STROKE_SPEED_PX_PER_SECOND).toBe('number');
  });
});

describe('Public API surface — planner + stream-overlay + layout-spacing', () => {
  it('exports the expected names from planner, stream-overlay, layout-spacing', async () => {
    const planner = await import('@/lib/whiteboard/planner/index');
    expect(Object.keys(planner).sort()).toMatchInlineSnapshot(`
      [
        "DEFAULT_PLANNER_CONFIG",
        "buildStructuredWhiteboardContext",
        "enforceDrawBatchConstraints",
        "extendStructuredWhiteboardContext",
        "fromLegacyDrawBatchToSemanticStub",
        "lowerPlannedLayoutToDrawBatch",
        "planSemanticBatch",
      ]
    `);

    const overlay = await import('@/lib/whiteboard/stream-overlay');
    expect(Object.keys(overlay).sort()).toMatchInlineSnapshot(`
      [
        "extractStreamStepLines",
        "isStreamOverlayElementId",
        "removeStreamOverlayFromBatches",
        "removeStreamOverlayFromScene",
        "toStreamLatexKey",
        "toStreamTextKey",
      ]
    `);

    const spacing = await import('@/lib/whiteboard/layout-spacing');
    expect(Object.keys(spacing).sort()).toMatchInlineSnapshot(`
      [
        "normalizeBatchTextSpacingAgainstScene",
      ]
    `);
  });

  it('planner + overlay + spacing runtime exports have correct types', async () => {
    const planner = await import('@/lib/whiteboard/planner/index');
    expect(typeof planner.planSemanticBatch).toBe('function');
    expect(typeof planner.fromLegacyDrawBatchToSemanticStub).toBe('function');
    expect(typeof planner.enforceDrawBatchConstraints).toBe('function');
    expect(typeof planner.lowerPlannedLayoutToDrawBatch).toBe('function');
    expect(typeof planner.buildStructuredWhiteboardContext).toBe('function');
    expect(typeof planner.extendStructuredWhiteboardContext).toBe('function');
    expect(typeof planner.DEFAULT_PLANNER_CONFIG).toBe('object');

    const overlay = await import('@/lib/whiteboard/stream-overlay');
    expect(typeof overlay.isStreamOverlayElementId).toBe('function');
    expect(typeof overlay.removeStreamOverlayFromScene).toBe('function');
    expect(typeof overlay.removeStreamOverlayFromBatches).toBe('function');
    expect(typeof overlay.extractStreamStepLines).toBe('function');
    expect(typeof overlay.toStreamTextKey).toBe('function');
    expect(typeof overlay.toStreamLatexKey).toBe('function');

    const spacing = await import('@/lib/whiteboard/layout-spacing');
    expect(typeof spacing.normalizeBatchTextSpacingAgainstScene).toBe('function');
  });
});

describe('Public API surface — persistence + mode + useAgentStream', () => {
  it('exports the expected names from persistence.ts, mode.ts, and useAgentStream.ts', async () => {
    const persist = await import('@/lib/client/persistence');
    expect(Object.keys(persist).sort()).toMatchInlineSnapshot(`
      [
        "clearCorruptSession",
        "loadSession",
        "saveSession",
      ]
    `);

    const mode = await import('@/lib/mode');
    expect(Object.keys(mode).sort()).toMatchInlineSnapshot(`
      [
        "getClientAppMode",
        "getInitialAppMode",
      ]
    `);

    const hook = await import('@/hooks/useAgentStream');
    expect(Object.keys(hook).sort()).toMatchInlineSnapshot(`
      [
        "useAgentStream",
      ]
    `);
  });

  it('persistence + mode + hook runtime exports have correct types', async () => {
    const persist = await import('@/lib/client/persistence');
    expect(typeof persist.loadSession).toBe('function');
    expect(typeof persist.saveSession).toBe('function');
    expect(typeof persist.clearCorruptSession).toBe('function');

    const mode = await import('@/lib/mode');
    expect(typeof mode.getInitialAppMode).toBe('function');
    expect(typeof mode.getClientAppMode).toBe('function');

    const hook = await import('@/hooks/useAgentStream');
    expect(typeof hook.useAgentStream).toBe('function');
  });
});
