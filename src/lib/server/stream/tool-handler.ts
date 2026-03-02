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
import { parseGraphScriptToSemanticBatch } from '@/lib/whiteboard/graph-script';

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
  if (!parsedGraph.semanticBatch) {
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

  const planned = planSemanticBatch(parsedGraph.semanticBatch, ctx.turnContextV2);
  let drawBatch = lowerPlannedLayoutToDrawBatch(planned);
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
  return null;
}
