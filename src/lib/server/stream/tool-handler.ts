import type {
  DrawBatch,
  SemanticBatch,
  StructuredWhiteboardContext,
} from '@/types/agent';
import {
  DrawBatchSchema,
  SemanticBatchSchema,
  normalizeDrawBatchPayload,
  normalizeSemanticBatchPayload,
} from '@/lib/schema';
import {
  enforceDrawBatchConstraints,
  extendStructuredWhiteboardContext,
  fromLegacyDrawBatchToSemanticStub,
  lowerPlannedLayoutToDrawBatch,
  planSemanticBatch,
} from '@/lib/whiteboard/planner';
import { parseGraphScriptToSemanticBatch, renderMathScene } from '@/lib/whiteboard/graph-script';
import type { MathScene } from '@/lib/whiteboard/graph-script';
import { clampBatchCoordinates } from '@/lib/whiteboard/clamp-coordinates';

export interface ToolHandlerContext {
  send: (payload: unknown) => void;
  turnId: string;
  turnContextV2: StructuredWhiteboardContext | undefined;
  plannerMode: string;
  log: { warn: (msg: string, extra?: Record<string, unknown>) => void };
}

export interface ToolHandlerResult {
  functionOutput: string;
  updatedContext: StructuredWhiteboardContext | undefined;
  sawToolBatch: boolean;
  /** Updated provisional origin when a batch was placed */
  provisionalOrigin?: { x: number; y: number };
}

function handleGraphScript(
  parsedArgs: unknown,
  ctx: ToolHandlerContext,
): ToolHandlerResult {
  const parsedGraph = parseGraphScriptToSemanticBatch(parsedArgs);
  if (!parsedGraph.semanticBatch && !parsedGraph.plotBatch) {
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'INVALID_GRAPH_SCRIPT',
      message: 'Graph script could not be compiled',
      context: parsedGraph.warnings.join('; '),
    });
    return {
      functionOutput: JSON.stringify({ ok: false, error: 'invalid_graph_script' }),
      updatedContext: ctx.turnContextV2,
      sawToolBatch: false,
    };
  }

  if (parsedGraph.warnings.length > 0) {
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'GRAPH_SCRIPT_NORMALIZED',
      message: 'Graph script compiled with normalization',
      context: parsedGraph.warnings.join('; '),
    });
  }

  // Emit function-plot batch if present
  if (parsedGraph.plotBatch) {
    const constrained = enforceDrawBatchConstraints(parsedGraph.plotBatch);
    emitRepairWarning(constrained, 'graph script plot', ctx);
    ctx.send({ type: 'whiteboard.batch', turnId: ctx.turnId, batch: constrained.batch });
  }

  // If only a plot batch exists (no semantic blocks), return early
  if (!parsedGraph.semanticBatch) {
    return {
      functionOutput: JSON.stringify({
        ok: true,
        batch_id: parsedGraph.plotBatch!.batch_id,
        repaired: false,
        fallback_used: false,
      }),
      updatedContext: ctx.turnContextV2,
      sawToolBatch: true,
    };
  }

  const planned = planSemanticBatch(parsedGraph.semanticBatch, ctx.turnContextV2);
  let drawBatch = lowerPlannedLayoutToDrawBatch(planned);
  // SEC-006: clamp coordinates before constraint enforcement
  drawBatch = { ...drawBatch, elements: clampBatchCoordinates(drawBatch.elements) };
  const constrained = enforceDrawBatchConstraints(drawBatch);
  drawBatch = constrained.batch;

  if (planned.warnings.length > 0) {
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'SEMANTIC_PLANNER_WARNING',
      message: 'Graph script planner applied warnings',
      context: planned.warnings.join('; '),
    });
  }

  emitRepairWarning(constrained, 'graph script', ctx);

  ctx.send({
    type: 'whiteboard.layout.diagnostics',
    turnId: ctx.turnId,
    batchId: drawBatch.batch_id,
    violationsFixed: constrained.violationsFixed,
    templateUsed: planned.templateUsed,
    fallbackUsed: constrained.fallbackUsed,
    semanticBatch: planned.semanticBatch,
  });
  ctx.send({ type: 'whiteboard.batch', turnId: ctx.turnId, batch: drawBatch });

  const updatedContext = extendStructuredWhiteboardContext(ctx.turnContextV2, drawBatch, planned.semanticBatch);
  const suggested = updatedContext.suggested_next_regions[0];

  return {
    functionOutput: JSON.stringify({
      ok: true,
      batch_id: drawBatch.batch_id,
      repaired: constrained.violationsFixed.length > 0,
      fallback_used: constrained.fallbackUsed,
    }),
    updatedContext,
    sawToolBatch: true,
    provisionalOrigin: suggested ? { x: suggested.x, y: suggested.y } : undefined,
  };
}

function handleSemanticBatch(
  parsedArgs: unknown,
  ctx: ToolHandlerContext,
): ToolHandlerResult {
  let semanticPayload: SemanticBatch | null = null;
  let semanticWarnings: string[] = [];
  const semanticValidation = SemanticBatchSchema.safeParse(parsedArgs);
  if (semanticValidation.success) {
    semanticPayload = semanticValidation.data;
  } else {
    const normalized = normalizeSemanticBatchPayload(parsedArgs);
    semanticWarnings = normalized.warnings;
    if (normalized.normalized) {
      const normalizedValidation = SemanticBatchSchema.safeParse(normalized.normalized);
      if (normalizedValidation.success) {
        semanticPayload = normalizedValidation.data;
      } else {
        semanticWarnings = [
          ...semanticWarnings,
          ...normalizedValidation.error.issues.map((i) => i.message),
        ];
      }
    } else {
      semanticWarnings = [
        ...semanticWarnings,
        ...semanticValidation.error.issues.map((i) => i.message),
      ];
    }
  }

  if (!semanticPayload) {
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'INVALID_SEMANTIC_BATCH',
      message: 'Semantic draw batch failed validation and could not be repaired',
      context: semanticWarnings.join('; '),
    });
    return {
      functionOutput: JSON.stringify({ ok: false, error: 'invalid_semantic_schema' }),
      updatedContext: ctx.turnContextV2,
      sawToolBatch: false,
    };
  }

  if (semanticWarnings.length > 0) {
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'SEMANTIC_BATCH_NORMALIZED',
      message: 'Semantic draw batch was normalized for compatibility',
      context: semanticWarnings.join('; '),
    });
  }

  const planned = planSemanticBatch(semanticPayload, ctx.turnContextV2);
  let drawBatch = lowerPlannedLayoutToDrawBatch(planned);
  // SEC-006: clamp coordinates before constraint enforcement
  drawBatch = { ...drawBatch, elements: clampBatchCoordinates(drawBatch.elements) };
  const constrained = enforceDrawBatchConstraints(drawBatch);
  drawBatch = constrained.batch;

  if (planned.warnings.length > 0) {
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'SEMANTIC_PLANNER_WARNING',
      message: 'Semantic planner applied warnings',
      context: planned.warnings.join('; '),
    });
  }

  emitRepairWarning(constrained, 'semantic batch', ctx);

  ctx.send({
    type: 'whiteboard.layout.diagnostics',
    turnId: ctx.turnId,
    batchId: drawBatch.batch_id,
    violationsFixed: constrained.violationsFixed,
    templateUsed: planned.templateUsed,
    fallbackUsed: constrained.fallbackUsed,
    semanticBatch: semanticPayload,
  });
  ctx.send({ type: 'whiteboard.batch', turnId: ctx.turnId, batch: drawBatch });

  const updatedContext = extendStructuredWhiteboardContext(ctx.turnContextV2, drawBatch, planned.semanticBatch);
  const suggested = updatedContext.suggested_next_regions[0];

  return {
    functionOutput: JSON.stringify({
      ok: true,
      batch_id: drawBatch.batch_id,
      repaired: constrained.violationsFixed.length > 0,
      fallback_used: constrained.fallbackUsed,
    }),
    updatedContext,
    sawToolBatch: true,
    provisionalOrigin: suggested ? { x: suggested.x, y: suggested.y } : undefined,
  };
}

/** SEC-004: Hard element count cap applied during normalization and after re-validation */
const MAX_BATCH_ELEMENTS = 200;

function handleDrawBatch(
  parsedArgs: unknown,
  ctx: ToolHandlerContext,
): ToolHandlerResult {
  const strictValidation = DrawBatchSchema.safeParse(parsedArgs);
  let normalizedBatch = strictValidation.success ? strictValidation.data : null;
  const normalizationWarnings: string[] = [];

  if (!normalizedBatch) {
    const normalized = normalizeDrawBatchPayload(parsedArgs);
    normalizedBatch = normalized.normalized;
    normalizationWarnings.push(...normalized.warnings);

    // SEC-004: Re-validate normalized batch against DrawBatchSchema
    if (normalizedBatch) {
      const revalidation = DrawBatchSchema.safeParse(normalizedBatch);
      if (!revalidation.success) {
        ctx.log.warn('normalized_batch_revalidation_failed', {
          turnId: ctx.turnId,
          issues: revalidation.error.issues.map((i) => i.message).join('; '),
        });
        ctx.send({
          type: 'warning',
          turnId: ctx.turnId,
          code: 'INVALID_DRAW_BATCH',
          message: 'Normalized draw batch failed re-validation',
          context: revalidation.error.issues.map((i) => i.message).join('; '),
        });
        return {
          functionOutput: JSON.stringify({ ok: false, error: 'normalized_batch_invalid' }),
          updatedContext: ctx.turnContextV2,
          sawToolBatch: false,
        };
      }
      normalizedBatch = revalidation.data;
    }
  }

  // SEC-004: Hard element count check post-normalization
  if (normalizedBatch && normalizedBatch.elements.length > MAX_BATCH_ELEMENTS) {
    ctx.log.warn('batch_element_count_exceeded', {
      turnId: ctx.turnId,
      count: normalizedBatch.elements.length,
      max: MAX_BATCH_ELEMENTS,
    });
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'BATCH_TOO_LARGE',
      message: `Draw batch exceeds maximum element count (${MAX_BATCH_ELEMENTS})`,
      context: `Received ${normalizedBatch.elements.length} elements`,
    });
    return {
      functionOutput: JSON.stringify({ ok: false, error: 'batch_too_large' }),
      updatedContext: ctx.turnContextV2,
      sawToolBatch: false,
    };
  }

  if (!normalizedBatch || normalizedBatch.elements.length === 0) {
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'INVALID_DRAW_BATCH',
      message: 'Draw batch failed validation and normalization',
      context: strictValidation.success
        ? 'No drawable elements found'
        : strictValidation.error.issues.map((i) => i.message).join('; '),
    });
    return {
      functionOutput: JSON.stringify({ ok: false, error: 'invalid_schema' }),
      updatedContext: ctx.turnContextV2,
      sawToolBatch: false,
    };
  }

  if (normalizationWarnings.length > 0) {
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'DRAW_BATCH_NORMALIZED',
      message: 'Some draw elements were normalized or dropped',
      context: normalizationWarnings.join('; '),
    });
  }

  const constrained = enforceDrawBatchConstraints(normalizedBatch);
  // SEC-006: clamp coordinates after constraint enforcement for legacy draw batches
  constrained.batch = { ...constrained.batch, elements: clampBatchCoordinates(constrained.batch.elements) };
  emitRepairWarning(constrained, 'legacy draw batch', ctx);

  const legacySemantic = fromLegacyDrawBatchToSemanticStub(
    constrained.batch.batch_id,
    constrained.batch.elements,
  );
  ctx.send({
    type: 'whiteboard.layout.diagnostics',
    turnId: ctx.turnId,
    batchId: constrained.batch.batch_id,
    violationsFixed: constrained.violationsFixed,
    templateUsed: 'legacy_draw_batch',
    fallbackUsed: constrained.fallbackUsed,
    semanticBatch: legacySemantic,
  });
  ctx.send({ type: 'whiteboard.batch', turnId: ctx.turnId, batch: constrained.batch });

  const updatedContext = extendStructuredWhiteboardContext(
    ctx.turnContextV2,
    constrained.batch,
    legacySemantic,
  );
  const suggested = updatedContext.suggested_next_regions[0];

  return {
    functionOutput: JSON.stringify({
      ok: true,
      batch_id: constrained.batch.batch_id,
      repaired: constrained.violationsFixed.length > 0,
      fallback_used: constrained.fallbackUsed,
    }),
    updatedContext,
    sawToolBatch: true,
    provisionalOrigin: suggested ? { x: suggested.x, y: suggested.y } : undefined,
  };
}

function emitRepairWarning(
  constrained: { fallbackUsed: boolean; violationsFixed: string[] },
  label: string,
  ctx: ToolHandlerContext,
): void {
  const significantRepair =
    constrained.fallbackUsed ||
    constrained.violationsFixed.includes('region_reflow') ||
    constrained.violationsFixed.includes('scale_down_with_limits');
  if (significantRepair) {
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'LAYOUT_REPAIRED',
      message: `Layout constraints auto-repaired ${label}`,
      context: constrained.violationsFixed.join(', '),
    });
  }
}

function handleMathScene(
  parsedArgs: unknown,
  ctx: ToolHandlerContext,
): ToolHandlerResult {
  if (!parsedArgs || typeof parsedArgs !== 'object' || Array.isArray(parsedArgs)) {
    return {
      functionOutput: JSON.stringify({ ok: false, error: 'invalid_math_scene' }),
      updatedContext: ctx.turnContextV2,
      sawToolBatch: false,
    };
  }
  const scene = parsedArgs as MathScene;
  if (scene.type !== 'function_plot' && scene.type !== 'geometry' && scene.type !== 'algebra') {
    ctx.send({
      type: 'warning',
      turnId: ctx.turnId,
      code: 'INVALID_MATH_SCENE',
      message: 'Math scene type must be function_plot, geometry, or algebra',
    });
    return {
      functionOutput: JSON.stringify({ ok: false, error: 'invalid_math_scene_type' }),
      updatedContext: ctx.turnContextV2,
      sawToolBatch: false,
    };
  }
  const batch = renderMathScene(scene);
  const constrained = enforceDrawBatchConstraints(batch);
  emitRepairWarning(constrained, 'math scene', ctx);
  ctx.send({ type: 'whiteboard.batch', turnId: ctx.turnId, batch: constrained.batch });
  return {
    functionOutput: JSON.stringify({ ok: true, batch_id: constrained.batch.batch_id }),
    updatedContext: ctx.turnContextV2,
    sawToolBatch: true,
  };
}

/**
 * Dispatches a tool call to the appropriate handler.
 * Returns null for unknown tool names.
 */
export function handleToolCall(
  name: string,
  parsedArgs: unknown,
  ctx: ToolHandlerContext,
): ToolHandlerResult | null {
  if (name === 'emit_graph_script') return handleGraphScript(parsedArgs, ctx);
  if (name === 'emit_semantic_batch') return handleSemanticBatch(parsedArgs, ctx);
  if (name === 'emit_draw_batch') return handleDrawBatch(parsedArgs, ctx);
  if (name === 'emit_math_scene') return handleMathScene(parsedArgs, ctx);
  ctx.log.warn('unknown_tool_call', { name: String(name).slice(0, 120), turnId: ctx.turnId });
  return null;
}
