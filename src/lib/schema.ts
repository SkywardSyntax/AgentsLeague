import { z } from 'zod';
import { COORD_MIN, COORD_MAX } from '@/lib/whiteboard/coord-bounds';

const PointSchema = z.object({
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
});

const COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$|^[a-z]+$/i;

const BaseElementSchema = z.object({
  id: z.string().min(1).max(64),
  color: z.string().max(30).regex(COLOR_REGEX).optional(),
  stroke_width: z.number().positive().optional(),
  lineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
});

const RectSchema = BaseElementSchema.extend({
  type: z.literal('rect'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  w: z.number().positive().max(COORD_MAX),
  h: z.number().positive().max(COORD_MAX),
});

const EllipseSchema = BaseElementSchema.extend({
  type: z.literal('ellipse'),
  cx: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  cy: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  rx: z.number().positive().max(COORD_MAX),
  ry: z.number().positive().max(COORD_MAX),
});

const LineSchema = BaseElementSchema.extend({
  type: z.literal('line'),
  from: PointSchema,
  to: PointSchema,
});

const ArrowSchema = BaseElementSchema.extend({
  type: z.literal('arrow'),
  from: PointSchema,
  to: PointSchema,
});

const TextSchema = BaseElementSchema.extend({
  type: z.literal('text'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  text: z.string().max(500),
  size: z.number().positive().optional(),
});

const LatexSchema = BaseElementSchema.extend({
  type: z.literal('latex'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  tex: z.string().max(2_000),
  displayMode: z.boolean().optional(),
  fontSize: z.number().positive().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});

const ClearSchema = BaseElementSchema.extend({
  type: z.literal('clear'),
});

const StylePresetSchema = z.enum(['clean_pen_sketch', 'rough_sketch', 'blueprint_neat', 'mathematical']);

const CartesianAxesSchema = BaseElementSchema.extend({
  type: z.literal('cartesian_axes'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  width: z.number().positive().max(COORD_MAX),
  height: z.number().positive().max(COORD_MAX),
  xRange: z.tuple([z.number().finite(), z.number().finite()]),
  yRange: z.tuple([z.number().finite(), z.number().finite()]),
  xLabel: z.string().max(100).optional(),
  yLabel: z.string().max(100).optional(),
  gridlines: z.boolean().optional(),
  style: StylePresetSchema.optional(),
});

const NumberLineSchema = BaseElementSchema.extend({
  type: z.literal('number_line'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  length: z.number().positive().max(COORD_MAX),
  min: z.number().finite(),
  max: z.number().finite(),
  label: z.string().max(100).optional(),
  style: StylePresetSchema.optional(),
  highlights: z.array(z.object({
    value: z.number().finite(),
    label: z.string().max(100).optional(),
  })).max(50).optional(),
  intervals: z.array(z.object({
    from: z.number().finite(),
    to: z.number().finite(),
    color: z.string().max(30).regex(COLOR_REGEX).optional(),
  })).max(50).optional(),
});

const VectorArrowSchema = BaseElementSchema.extend({
  type: z.literal('vector_arrow'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  dx: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  dy: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  label: z.string().max(100).optional(),
  style: StylePresetSchema.optional(),
});

const MatrixBracketSchema = BaseElementSchema.extend({
  type: z.literal('matrix_bracket'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  rows: z.array(z.array(z.string().max(200)).min(1).max(20)).min(1).max(20),
  bracketStyle: z.enum(['[]', '()', '||', '{}']),
  cellWidth: z.number().positive().max(COORD_MAX).optional(),
  cellHeight: z.number().positive().max(COORD_MAX).optional(),
  style: StylePresetSchema.optional(),
});

const COLOR_OR_RGBA_REGEX = /^#[0-9a-fA-F]{3,8}$|^[a-z]+$|^rgba?\(\s*[\d.]+/i;

const AngleArcSchema = BaseElementSchema.extend({
  type: z.literal('angle_arc'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  radius: z.number().positive().max(COORD_MAX),
  startAngle: z.number().finite(),
  endAngle: z.number().finite(),
  label: z.string().max(100).optional(),
  style: StylePresetSchema.optional(),
});

const IntegralRegionSchema = BaseElementSchema.extend({
  type: z.literal('integral_region'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  width: z.number().positive().max(COORD_MAX),
  height: z.number().positive().max(COORD_MAX),
  xRange: z.tuple([z.number().finite(), z.number().finite()]),
  yRange: z.tuple([z.number().finite(), z.number().finite()]),
  topPoints: z.array(PointSchema).min(2).max(500),
  bottomPoints: z.array(PointSchema).max(500).optional(),
  fillColor: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
  strokeColor: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
  label: z.string().max(200).optional(),
  style: StylePresetSchema.optional(),
});

const CircleWithRadiusSchema = BaseElementSchema.extend({
  type: z.literal('circle_with_radius'),
  cx: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  cy: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  r: z.number().positive().max(COORD_MAX),
  label: z.string().max(100).optional(),
  showCenter: z.boolean().optional(),
  showRadius: z.boolean().optional(),
  radiusAngle: z.number().finite().optional(),
  style: StylePresetSchema.optional(),
});

const TriangleVertexSchema = z.object({
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  label: z.string().max(100).optional(),
});

const TriangleWithAnglesSchema = BaseElementSchema.extend({
  type: z.literal('triangle_with_angles'),
  vertices: z.tuple([TriangleVertexSchema, TriangleVertexSchema, TriangleVertexSchema]),
  showAngles: z.boolean().optional(),
  showSides: z.boolean().optional(),
  sideLabels: z.tuple([z.string().max(100).optional(), z.string().max(100).optional(), z.string().max(100).optional()]).optional(),
  angleLabels: z.tuple([z.string().max(100).optional(), z.string().max(100).optional(), z.string().max(100).optional()]).optional(),
  style: StylePresetSchema.optional(),
});

export const DrawElementSchema = z.discriminatedUnion('type', [
  RectSchema,
  EllipseSchema,
  LineSchema,
  ArrowSchema,
  TextSchema,
  LatexSchema,
  ClearSchema,
  CartesianAxesSchema,
  NumberLineSchema,
  VectorArrowSchema,
  MatrixBracketSchema,
  AngleArcSchema,
  IntegralRegionSchema,
  CircleWithRadiusSchema,
  TriangleWithAnglesSchema,
]);

const BatchSourceSchema = z.enum(['ai-stream', 'injection', 'template']).optional();

export const DrawBatchSchema = z.object({
  batch_id: z.string().min(1).max(64),
  style_preset: z.enum(['clean_pen_sketch', 'rough_sketch', 'blueprint_neat', 'mathematical']).optional(),
  elements: z.array(DrawElementSchema).max(200),
  source: BatchSourceSchema,
  schemaVersion: z.number().int().default(1),
});

const ChatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(50_000),
  createdAt: z.number().int().optional(),
});

const WhiteboardContextSchema = z.object({
  elementCount: z.number().int().nonnegative(),
  bounds: z
    .object({
      minX: z.number().finite(),
      minY: z.number().finite(),
      maxX: z.number().finite(),
      maxY: z.number().finite(),
    })
    .optional(),
  elementTypeCounts: z.record(z.string(), z.number().int().nonnegative()),
  recentElements: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(['rect', 'ellipse', 'line', 'arrow', 'text', 'latex', 'clear']),
      textPreview: z.string().optional(),
    }),
  ),
  suggestedNextOrigin: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
});

export const StructuredWhiteboardContextSchema = z.object({
  scene_summary: z.object({
    element_count: z.number().int().nonnegative(),
    bounds: z
      .object({
        minX: z.number().finite(),
        minY: z.number().finite(),
        maxX: z.number().finite(),
        maxY: z.number().finite(),
      })
      .optional(),
    type_counts: z.record(z.string(), z.number().int().nonnegative()),
    element_type_summary: z.record(z.string(), z.number().int().nonnegative()).default({}),
    math_context: z.enum(['empty', 'has_axes', 'has_function', 'has_geometry']).default('empty'),
    suggested_drawing_style: z.enum(['clean', 'sketch', 'formal']).default('clean'),
  }),
  occupied_regions: z.array(
    z.object({
      id: z.string().min(1),
      x: z.number().finite(),
      y: z.number().finite(),
      w: z.number().nonnegative(),
      h: z.number().nonnegative(),
      semantic_kind: z.string().min(1),
      priority: z.number().int().min(0).max(10),
    }),
  ),
  anchors: z.array(
    z.object({
      id: z.string().min(1),
      x: z.number().finite(),
      y: z.number().finite(),
      role: z.string().min(1),
    }),
  ),
  recent_blocks: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.string().min(1),
      region: z.string().min(1),
      text_preview: z.string().optional(),
    }),
  ),
  suggested_next_regions: z
    .array(
      z.object({
        name: z.string().min(1),
        x: z.number().finite(),
        y: z.number().finite(),
        w: z.number().nonnegative(),
        h: z.number().nonnegative(),
        score: z.number().min(0).max(1),
      }),
    )
    .max(8),
  token_budget_hint: z.object({
    max_chars: z.number().int().positive().max(20000),
  }),
});

const RelativePoseSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1).optional(),
  h: z.number().min(0).max(1).optional(),
  rotation_deg: z.number().finite().optional(),
});

const SemanticEquationLineSchema = z.object({
  id: z.string().min(1).max(64),
  tex: z.string().min(1),
  displayMode: z.boolean().optional(),
  role: z.enum(['step', 'result', 'note']).optional(),
});

const SemanticEquationStackBlockSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.literal('equation_stack'),
  region_hint: z.enum(['left', 'right', 'center', 'bottom', 'auto']).optional(),
  title: z.string().max(200).optional(),
  lines: z.array(SemanticEquationLineSchema).min(1),
  align: z.enum(['left', 'center']).optional(),
});

const SemanticDiagramPanelBlockSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.literal('diagram_panel'),
  region_hint: z.enum(['left', 'right', 'center', 'auto']).optional(),
  title: z.string().max(200).optional(),
  axes: z
    .object({
      x_label: z.string().min(1),
      y_label: z.string().min(1),
    })
    .optional(),
  shapes: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        type: z.enum(['rect', 'parallelogram', 'line', 'arrow']),
        label: z.string().max(200).optional(),
        relative_pose: RelativePoseSchema.optional(),
      }),
    )
    .optional(),
  captions: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().min(1),
        anchor: z.enum(['top', 'bottom', 'left', 'right', 'center']),
      }),
    )
    .optional(),
});

const SemanticCaptionBlockSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.literal('caption'),
  text: z.string().min(1),
  region_hint: z.enum(['bottom', 'center', 'auto']).optional(),
});

const SemanticBlockSchema = z.discriminatedUnion('kind', [
  SemanticEquationStackBlockSchema,
  SemanticDiagramPanelBlockSchema,
  SemanticCaptionBlockSchema,
]);

const SemanticRelationSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['maps_to', 'explains', 'derived_from', 'points_to']),
  from_block_id: z.string().min(1).max(64),
  to_block_id: z.string().min(1).max(64),
  from_anchor: z.string().min(1).optional(),
  to_anchor: z.string().min(1).optional(),
  label: z.string().max(200).optional(),
});

export const SemanticBatchSchema = z.object({
  batch_id: z.string().min(1).max(64),
  style_preset: z.enum(['clean_pen_sketch', 'rough_sketch', 'blueprint_neat', 'mathematical']).optional(),
  template: z.enum(['equation_derivation_vertical', 'jacobian_mapping_2panel', 'freeform_semantic']),
  blocks: z.array(SemanticBlockSchema).min(1).max(50),
  relations: z.array(SemanticRelationSchema).max(100).optional(),
  intent: z.enum(['teach', 'derive', 'compare', 'summarize']).optional(),
});

const SESSION_ID_REGEX = /^[\w-]+$/;

export const AgentStreamRequestSchema = z.object({
  sessionId: z.string().min(1).max(128).regex(SESSION_ID_REGEX),
  userMessage: z.string().min(1).max(10_000),
  history: z.array(ChatMessageSchema).max(100),
  plannerMode: z.enum(['semantic_preferred', 'legacy_draw_only']).optional(),
  whiteboardContext: WhiteboardContextSchema.optional(),
  whiteboardContextV2: StructuredWhiteboardContextSchema.optional(),
  scenario: z.enum([
    'happy',
    'error_mid_stream',
    'rate_limit',
    'network_drop',
    'slow_thinking',
    'malformed_event',
    'auth_error',
  ]).optional(),
});

export type DrawBatchInput = z.infer<typeof DrawBatchSchema>;
export type SemanticBatchInput = z.infer<typeof SemanticBatchSchema>;
export type AgentStreamRequestInput = z.infer<typeof AgentStreamRequestSchema>;

// ---------- SSE Event Validation ----------

const TokenUsageSchema = z.object({
  prompt: z.number().int().nonnegative().optional(),
  completion: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
});

const SEMANTIC_TEMPLATES = [
  'equation_derivation_vertical',
  'jacobian_mapping_2panel',
  'freeform_semantic',
] as const;

const SemanticBatchRefSchema = z.object({
  batch_id: z.string().min(1),
  style_preset: z.enum(['clean_pen_sketch', 'rough_sketch', 'blueprint_neat', 'mathematical']).optional(),
  template: z.enum(SEMANTIC_TEMPLATES),
  blocks: z.array(SemanticBlockSchema).min(1),
  relations: z.array(SemanticRelationSchema).optional(),
  intent: z.enum(['teach', 'derive', 'compare', 'summarize']).optional(),
});

export const AgentSSEEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('assistant.text.delta'),
    turnId: z.string().min(1),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('assistant.text.done'),
    turnId: z.string().min(1),
    messageId: z.string().min(1),
  }),
  z.object({
    type: z.literal('whiteboard.batch'),
    turnId: z.string().min(1),
    batch: DrawBatchSchema,
  }),
  z.object({
    type: z.literal('whiteboard.layout.diagnostics'),
    turnId: z.string().min(1),
    batchId: z.string().min(1),
    violationsFixed: z.array(z.string()),
    templateUsed: z.enum([...SEMANTIC_TEMPLATES, 'legacy_draw_batch']),
    fallbackUsed: z.boolean(),
    semanticBatch: SemanticBatchRefSchema.optional(),
  }),
  z.object({
    type: z.literal('warning'),
    turnId: z.string().min(1),
    code: z.string().min(1),
    message: z.string().min(1),
    context: z.string().optional(),
  }),
  z.object({
    type: z.literal('error'),
    turnId: z.string().min(1),
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
    retryAfterMs: z.number().optional(),
  }),
  z.object({
    type: z.literal('turn.done'),
    turnId: z.string().min(1),
    usage: TokenUsageSchema.optional(),
    partial: z.boolean().optional(),
  }),
]);

export type ValidatedAgentSSEEvent = z.infer<typeof AgentSSEEventSchema>;

/** Validate an SSE event payload; returns the parsed event or null on failure. */
export function validateSSEEvent(event: unknown): ValidatedAgentSSEEvent | null {
  const result = AgentSSEEventSchema.safeParse(event);
  return result.success ? result.data : null;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function asNumber(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(input: unknown): string | null {
  return typeof input === 'string' ? input : null;
}

import { clamp } from '@/lib/whiteboard/geometry';

export const STYLE_PRESETS = ['clean_pen_sketch', 'rough_sketch', 'blueprint_neat', 'mathematical'] as const;
export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export const TEMPLATES = ['equation_derivation_vertical', 'jacobian_mapping_2panel', 'freeform_semantic'] as const;
export const INTENTS = ['teach', 'derive', 'compare', 'summarize'] as const;
export const EQUATION_ROLES = ['step', 'result', 'note'] as const;
export const EQUATION_ALIGN = ['left', 'center'] as const;
export const REGION_HINTS = ['left', 'right', 'center', 'bottom', 'auto'] as const;
export const PANEL_REGION_HINTS = ['left', 'right', 'center', 'auto'] as const;
export const CAPTION_REGION_HINTS = ['bottom', 'center', 'auto'] as const;
export const PANEL_SHAPE_TYPES = ['rect', 'parallelogram', 'line', 'arrow'] as const;

function pointFrom(input: unknown): { x: number; y: number } | null {
  const rec = asRecord(input);
  if (!rec) return null;
  const x = asNumber(rec.x);
  const y = asNumber(rec.y);
  if (x == null || y == null) return null;
  return { x, y };
}

/**
 * Normalizes raw LLM output into a valid {@link DrawBatchInput}.
 * Handles missing fields, type coercion, and alternate key names (e.g. `width` → `w`).
 * Returns warnings for each element that could not be salvaged.
 */
export function normalizeDrawBatchPayload(payload: unknown): {
  normalized: DrawBatchInput | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const rec = asRecord(payload);
  if (!rec) return { normalized: null, warnings: ['Draw batch payload is not an object'] };

  const rawElements = Array.isArray(rec.elements) ? rec.elements : [];
  const elements: DrawBatchInput['elements'] = [];

  for (let idx = 0; idx < rawElements.length; idx++) {
    const raw = asRecord(rawElements[idx]);
    if (!raw) {
      warnings.push(`Element ${idx} is not an object`);
      continue;
    }

    const type = asString(raw.type);
    const id = asString(raw.id) ?? `element-${idx + 1}`;
    const color = asString(raw.color) ?? undefined;
    const stroke_width = asNumber(raw.stroke_width) ?? undefined;
    const lineStyle = asEnum(raw.lineStyle, LINE_STYLES) ?? undefined;

    if (type === 'clear') {
      elements.push({ id, type });
      continue;
    }

    if (type === 'rect') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const w = asNumber(raw.w) ?? asNumber(raw.width);
      const h = asNumber(raw.h) ?? asNumber(raw.height);
      if (x == null || y == null || w == null || h == null) {
        warnings.push(`Rect ${id} has invalid coordinates`);
        continue;
      }
      const cw = Math.max(1, Math.abs(w));
      const ch = Math.max(1, Math.abs(h));
      if (cw !== w || ch !== h) warnings.push(`Rect ${id} dimensions clamped to positive`);
      elements.push({ id, type, x, y, w: cw, h: ch, ...(color ? { color } : {}), ...(stroke_width ? { stroke_width } : {}), ...(lineStyle ? { lineStyle } : {}) });
      continue;
    }

    if (type === 'ellipse') {
      const cx = asNumber(raw.cx) ?? asNumber(raw.x);
      const cy = asNumber(raw.cy) ?? asNumber(raw.y);
      const rx = asNumber(raw.rx) ?? ((asNumber(raw.width) ?? 0) / 2 || null);
      const ry = asNumber(raw.ry) ?? ((asNumber(raw.height) ?? 0) / 2 || null);
      if (cx == null || cy == null || rx == null || ry == null) {
        warnings.push(`Ellipse ${id} has invalid coordinates`);
        continue;
      }
      const crx = Math.max(1, Math.abs(rx));
      const cry = Math.max(1, Math.abs(ry));
      if (crx !== rx || cry !== ry) warnings.push(`Ellipse ${id} radii clamped to positive`);
      elements.push({ id, type, cx, cy, rx: crx, ry: cry, ...(color ? { color } : {}), ...(stroke_width ? { stroke_width } : {}), ...(lineStyle ? { lineStyle } : {}) });
      continue;
    }

    if (type === 'line' || type === 'arrow') {
      const from = pointFrom(raw.from) ?? (asNumber(raw.x1) != null && asNumber(raw.y1) != null ? { x: asNumber(raw.x1)!, y: asNumber(raw.y1)! } : null);
      const to = pointFrom(raw.to) ?? (asNumber(raw.x2) != null && asNumber(raw.y2) != null ? { x: asNumber(raw.x2)!, y: asNumber(raw.y2)! } : null);
      if (!from || !to) {
        warnings.push(`${type} ${id} has invalid endpoints`);
        continue;
      }
      elements.push({ id, type, from, to, ...(color ? { color } : {}), ...(stroke_width ? { stroke_width } : {}), ...(lineStyle ? { lineStyle } : {}) });
      continue;
    }

    if (type === 'text') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const text = asString(raw.text) ?? asString(raw.content);
      const size = asNumber(raw.size) ?? undefined;
      if (x == null || y == null || !text) {
        warnings.push(`Text ${id} has invalid payload`);
        continue;
      }
      elements.push({ id, type, x, y, text, ...(size ? { size } : {}), ...(color ? { color } : {}), ...(stroke_width ? { stroke_width } : {}), ...(lineStyle ? { lineStyle } : {}) });
      continue;
    }

    if (type === 'latex') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const tex = asString(raw.tex) ?? asString(raw.latex) ?? asString(raw.text);
      const displayMode = typeof raw.displayMode === 'boolean' ? raw.displayMode : undefined;
      const fontSize = asNumber(raw.fontSize) ?? asNumber(raw.size) ?? undefined;
      const align = raw.align === 'left' || raw.align === 'center' || raw.align === 'right' ? raw.align : undefined;
      if (x == null || y == null || !tex) {
        warnings.push(`LaTeX ${id} has invalid payload`);
        continue;
      }
      elements.push({
        id,
        type,
        x,
        y,
        tex,
        ...(displayMode != null ? { displayMode } : {}),
        ...(fontSize ? { fontSize } : {}),
        ...(align ? { align } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // function_curve: pass through as-is with validation (lowered later)
    if (type === 'function_curve') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const width = asNumber(raw.width) ?? asNumber(raw.w);
      const height = asNumber(raw.height) ?? asNumber(raw.h);
      const rawXRange = Array.isArray(raw.xRange) ? raw.xRange : null;
      const rawYRange = Array.isArray(raw.yRange) ? raw.yRange : null;
      if (x == null || y == null || width == null || height == null || !rawXRange || !rawYRange) {
        warnings.push(`FunctionCurve ${id} has invalid coordinates or ranges`);
        continue;
      }
      const xr0 = asNumber(rawXRange[0]);
      const xr1 = asNumber(rawXRange[1]);
      const yr0 = asNumber(rawYRange[0]);
      const yr1 = asNumber(rawYRange[1]);
      if (xr0 == null || xr1 == null || yr0 == null || yr1 == null) {
        warnings.push(`FunctionCurve ${id} has invalid range values`);
        continue;
      }
      const expression = asString(raw.expression) ?? undefined;
      const label = asString(raw.label) ?? undefined;
      const rawPoints = Array.isArray(raw.points) ? raw.points : undefined;
      let points: Array<{ x: number; y: number }> | undefined;
      if (rawPoints) {
        points = [];
        for (const rp of rawPoints) {
          const pt = pointFrom(rp);
          if (pt) points.push(pt);
        }
        if (points.length === 0) points = undefined;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        x,
        y,
        width: Math.max(1, Math.abs(width)),
        height: Math.max(1, Math.abs(height)),
        xRange: [xr0, xr1] as [number, number],
        yRange: [yr0, yr1] as [number, number],
        ...(expression ? { expression } : {}),
        ...(points ? { points } : {}),
        ...(label ? { label } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // angle_arc: pass through with validation
    if (type === 'angle_arc') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const radius = asNumber(raw.radius);
      const startAngle = asNumber(raw.startAngle);
      const endAngle = asNumber(raw.endAngle);
      if (x == null || y == null || radius == null || startAngle == null || endAngle == null) {
        warnings.push(`AngleArc ${id} has invalid coordinates or angles`);
        continue;
      }
      const label = asString(raw.label) ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        x,
        y,
        radius: Math.max(1, Math.abs(radius)),
        startAngle,
        endAngle,
        ...(label ? { label } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // integral_region: pass through with validation
    if (type === 'integral_region') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const width = asNumber(raw.width) ?? asNumber(raw.w);
      const height = asNumber(raw.height) ?? asNumber(raw.h);
      const rawXRange = Array.isArray(raw.xRange) ? raw.xRange : null;
      const rawYRange = Array.isArray(raw.yRange) ? raw.yRange : null;
      if (x == null || y == null || width == null || height == null || !rawXRange || !rawYRange) {
        warnings.push(`IntegralRegion ${id} has invalid coordinates or ranges`);
        continue;
      }
      const xr0 = asNumber(rawXRange[0]);
      const xr1 = asNumber(rawXRange[1]);
      const yr0 = asNumber(rawYRange[0]);
      const yr1 = asNumber(rawYRange[1]);
      if (xr0 == null || xr1 == null || yr0 == null || yr1 == null) {
        warnings.push(`IntegralRegion ${id} has invalid range values`);
        continue;
      }
      const rawTopPoints = Array.isArray(raw.topPoints) ? raw.topPoints : null;
      if (!rawTopPoints || rawTopPoints.length < 2) {
        warnings.push(`IntegralRegion ${id} needs at least 2 topPoints`);
        continue;
      }
      const topPoints: Array<{ x: number; y: number }> = [];
      for (const rp of rawTopPoints) {
        const pt = pointFrom(rp);
        if (pt) topPoints.push(pt);
      }
      if (topPoints.length < 2) {
        warnings.push(`IntegralRegion ${id} has insufficient valid topPoints`);
        continue;
      }
      let bottomPoints: Array<{ x: number; y: number }> | undefined;
      const rawBottomPoints = Array.isArray(raw.bottomPoints) ? raw.bottomPoints : undefined;
      if (rawBottomPoints) {
        bottomPoints = [];
        for (const rp of rawBottomPoints) {
          const pt = pointFrom(rp);
          if (pt) bottomPoints.push(pt);
        }
        if (bottomPoints.length === 0) bottomPoints = undefined;
      }
      const fillColor = asString(raw.fillColor) ?? undefined;
      const strokeColor = asString(raw.strokeColor) ?? undefined;
      const label = asString(raw.label) ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        x,
        y,
        width: Math.max(1, Math.abs(width)),
        height: Math.max(1, Math.abs(height)),
        xRange: [xr0, xr1] as [number, number],
        yRange: [yr0, yr1] as [number, number],
        topPoints,
        ...(bottomPoints ? { bottomPoints } : {}),
        ...(fillColor ? { fillColor } : {}),
        ...(strokeColor ? { strokeColor } : {}),
        ...(label ? { label } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // circle_with_radius: pass through with validation
    if (type === 'circle_with_radius') {
      const cx = asNumber(raw.cx) ?? asNumber(raw.x);
      const cy = asNumber(raw.cy) ?? asNumber(raw.y);
      const r = asNumber(raw.r) ?? asNumber(raw.radius);
      if (cx == null || cy == null || r == null) {
        warnings.push(`CircleWithRadius ${id} has invalid coordinates or radius`);
        continue;
      }
      const label = asString(raw.label) ?? undefined;
      const showCenter = typeof raw.showCenter === 'boolean' ? raw.showCenter : undefined;
      const showRadius = typeof raw.showRadius === 'boolean' ? raw.showRadius : undefined;
      const radiusAngle = asNumber(raw.radiusAngle) ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        cx,
        cy,
        r: Math.max(1, Math.abs(r)),
        ...(label ? { label } : {}),
        ...(showCenter != null ? { showCenter } : {}),
        ...(showRadius != null ? { showRadius } : {}),
        ...(radiusAngle != null ? { radiusAngle } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // triangle_with_angles: pass through with validation
    if (type === 'triangle_with_angles') {
      const rawVerts = Array.isArray(raw.vertices) ? raw.vertices : null;
      if (!rawVerts || rawVerts.length !== 3) {
        warnings.push(`TriangleWithAngles ${id} needs exactly 3 vertices`);
        continue;
      }
      const vertices: Array<{ x: number; y: number; label?: string }> = [];
      let verticesValid = true;
      for (const rv of rawVerts) {
        const rec = asRecord(rv);
        if (!rec) { verticesValid = false; break; }
        const vx = asNumber(rec.x);
        const vy = asNumber(rec.y);
        if (vx == null || vy == null) { verticesValid = false; break; }
        const vLabel = asString(rec.label) ?? undefined;
        vertices.push({ x: vx, y: vy, ...(vLabel ? { label: vLabel } : {}) });
      }
      if (!verticesValid || vertices.length !== 3) {
        warnings.push(`TriangleWithAngles ${id} has invalid vertex coordinates`);
        continue;
      }
      const showAngles = typeof raw.showAngles === 'boolean' ? raw.showAngles : undefined;
      const showSides = typeof raw.showSides === 'boolean' ? raw.showSides : undefined;
      const rawSideLabels = Array.isArray(raw.sideLabels) ? raw.sideLabels : undefined;
      const rawAngleLabels = Array.isArray(raw.angleLabels) ? raw.angleLabels : undefined;
      const sideLabels = rawSideLabels ? [asString(rawSideLabels[0]) ?? undefined, asString(rawSideLabels[1]) ?? undefined, asString(rawSideLabels[2]) ?? undefined] as [string?, string?, string?] : undefined;
      const angleLabels = rawAngleLabels ? [asString(rawAngleLabels[0]) ?? undefined, asString(rawAngleLabels[1]) ?? undefined, asString(rawAngleLabels[2]) ?? undefined] as [string?, string?, string?] : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        vertices: vertices as [typeof vertices[0], typeof vertices[1], typeof vertices[2]],
        ...(showAngles != null ? { showAngles } : {}),
        ...(showSides != null ? { showSides } : {}),
        ...(sideLabels ? { sideLabels } : {}),
        ...(angleLabels ? { angleLabels } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    warnings.push(`Unsupported element type at ${idx}`);
  }

  const batch_id = asString(rec.batch_id) ?? `batch-${Date.now()}`;
  const style_preset =
    rec.style_preset === 'clean_pen_sketch' ||
    rec.style_preset === 'rough_sketch' ||
    rec.style_preset === 'blueprint_neat' ||
    rec.style_preset === 'mathematical'
      ? rec.style_preset
      : undefined;

  const normalized: DrawBatchInput = {
    batch_id,
    ...(style_preset ? { style_preset } : {}),
    elements,
    schemaVersion: 1,
  };

  return { normalized, warnings };
}
export const CAPTION_ANCHORS = ['top', 'bottom', 'left', 'right', 'center'] as const;
export const RELATION_TYPES = ['maps_to', 'explains', 'derived_from', 'points_to'] as const;
export const DRAW_ELEMENT_TYPES = ['rect', 'ellipse', 'line', 'arrow', 'text', 'latex', 'clear', 'cartesian_axes', 'number_line', 'vector_arrow', 'function_curve', 'matrix_bracket', 'angle_arc', 'integral_region', 'circle_with_radius', 'triangle_with_angles'] as const;
export const LATEX_ALIGN = ['left', 'center', 'right'] as const;
export const BLOCK_KINDS = ['equation_stack', 'diagram_panel', 'caption'] as const;

export function isEnumMember<T extends readonly string[]>(allowed: T, value: string): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

function asEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === 'string' && isEnumMember(allowed, value)
    ? value
    : null;
}

function asBoolean(input: unknown): boolean | null {
  return typeof input === 'boolean' ? input : null;
}

/**
 * Normalizes raw LLM output into a valid {@link SemanticBatchInput}.
 * Applies defaults for missing templates/intents and validates all nested blocks.
 * Returns warnings for each block or field that could not be salvaged.
 */
export function normalizeSemanticBatchPayload(payload: unknown): {
  normalized: SemanticBatchInput | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const rec = asRecord(payload);
  if (!rec) return { normalized: null, warnings: ['Semantic batch payload is not an object'] };

  const batch_id = asString(rec.batch_id) ?? `semantic-${Date.now()}`;

  const style_preset = asEnum(rec.style_preset, STYLE_PRESETS) ?? undefined;
  if (rec.style_preset != null && !style_preset) {
    warnings.push('Invalid style_preset; using default');
  }

  let template = asEnum(rec.template, TEMPLATES);
  if (!template) {
    template = 'freeform_semantic';
    if (rec.template != null) warnings.push('Invalid template; defaulted to freeform_semantic');
  }

  const intent = asEnum(rec.intent, INTENTS) ?? undefined;
  if (rec.intent != null && !intent) warnings.push('Invalid intent dropped');

  const rawBlocks = Array.isArray(rec.blocks) ? rec.blocks : [];
  const blocks: SemanticBatchInput['blocks'] = [];

  for (let idx = 0; idx < rawBlocks.length; idx++) {
    const rawBlock = asRecord(rawBlocks[idx]);
    if (!rawBlock) {
      warnings.push(`Block ${idx} is not an object`);
      continue;
    }

    const kind = asString(rawBlock.kind);
    const id = asString(rawBlock.id) ?? `block-${idx + 1}`;

    if (kind === 'equation_stack') {
      const rawLines = Array.isArray(rawBlock.lines) ? rawBlock.lines : [];
      const lines: NonNullable<SemanticBatchInput['blocks'][number] extends infer B
        ? B extends { kind: 'equation_stack'; lines: infer L }
          ? L
          : never
        : never> = [];

      for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
        const rawLine = asRecord(rawLines[lineIdx]);
        if (!rawLine) {
          warnings.push(`Equation line ${id}.${lineIdx} is not an object`);
          continue;
        }
        const lineId = asString(rawLine.id) ?? `line-${lineIdx + 1}`;
        const tex = asString(rawLine.tex) ?? asString(rawLine.latex) ?? asString(rawLine.text);
        if (!tex || tex.trim().length === 0) {
          warnings.push(`Equation line ${id}.${lineIdx} missing tex`);
          continue;
        }
        const displayMode = asBoolean(rawLine.displayMode);
        const role = asEnum(rawLine.role, EQUATION_ROLES) ?? undefined;

        lines.push({
          id: lineId,
          tex,
          ...(displayMode == null ? {} : { displayMode }),
          ...(role ? { role } : {}),
        });
      }

      if (lines.length === 0) {
        warnings.push(`Equation stack ${id} dropped: no valid lines`);
        continue;
      }

      const region_hint = asEnum(rawBlock.region_hint, REGION_HINTS) ?? undefined;
      const align = asEnum(rawBlock.align, EQUATION_ALIGN) ?? undefined;
      const title = asString(rawBlock.title) ?? undefined;

      blocks.push({
        id,
        kind: 'equation_stack',
        ...(region_hint ? { region_hint } : {}),
        ...(title ? { title } : {}),
        ...(align ? { align } : {}),
        lines,
      });
      continue;
    }

    if (kind === 'diagram_panel') {
      const region_hint = asEnum(rawBlock.region_hint, PANEL_REGION_HINTS) ?? undefined;
      const title = asString(rawBlock.title) ?? undefined;

      const rawAxes = asRecord(rawBlock.axes);
      const x_label = rawAxes ? asString(rawAxes.x_label) : null;
      const y_label = rawAxes ? asString(rawAxes.y_label) : null;
      const axes =
        x_label && y_label
          ? { x_label, y_label }
          : x_label || y_label
            ? {
                x_label: x_label ?? 'x',
                y_label: y_label ?? 'y',
              }
            : undefined;
      if (rawAxes && !axes) warnings.push(`Panel ${id} axes dropped`);

      const rawShapes = Array.isArray(rawBlock.shapes) ? rawBlock.shapes : [];
      const shapes: Array<{
        id: string;
        type: 'rect' | 'parallelogram' | 'line' | 'arrow';
        label?: string;
        relative_pose?: { x: number; y: number; w?: number; h?: number; rotation_deg?: number };
      }> = [];

      for (let shapeIdx = 0; shapeIdx < rawShapes.length; shapeIdx++) {
        const rawShape = asRecord(rawShapes[shapeIdx]);
        if (!rawShape) {
          warnings.push(`Shape ${id}.${shapeIdx} is not an object`);
          continue;
        }
        const shapeType = asEnum(rawShape.type, PANEL_SHAPE_TYPES);
        if (!shapeType) {
          warnings.push(`Shape ${id}.${shapeIdx} dropped: invalid type`);
          continue;
        }
        const shapeId = asString(rawShape.id) ?? `shape-${shapeIdx + 1}`;
        const label = asString(rawShape.label) ?? undefined;

        const rawPose = asRecord(rawShape.relative_pose);
        let relative_pose:
          | {
              x: number;
              y: number;
              w?: number;
              h?: number;
              rotation_deg?: number;
            }
          | undefined;
        if (rawPose) {
          const x = asNumber(rawPose.x);
          const y = asNumber(rawPose.y);
          const w = asNumber(rawPose.w);
          const h = asNumber(rawPose.h);
          const rotation_deg = asNumber(rawPose.rotation_deg) ?? undefined;

          if (x != null || y != null || w != null || h != null || rotation_deg != null) {
            const nx = clamp(x ?? 0.5, 0, 1);
            const ny = clamp(y ?? 0.5, 0, 1);
            const nw = w == null ? undefined : clamp(w, 0, 1);
            const nh = h == null ? undefined : clamp(h, 0, 1);

            if ((x != null && x !== nx) || (y != null && y !== ny) || (w != null && w !== nw) || (h != null && h !== nh)) {
              warnings.push(`Shape ${id}.${shapeId} relative_pose clamped to [0,1]`);
            }

            relative_pose = {
              x: nx,
              y: ny,
              ...(nw == null ? {} : { w: nw }),
              ...(nh == null ? {} : { h: nh }),
              ...(rotation_deg == null ? {} : { rotation_deg }),
            };
          }
        }

        shapes.push({
          id: shapeId,
          type: shapeType,
          ...(label ? { label } : {}),
          ...(relative_pose ? { relative_pose } : {}),
        });
      }

      const rawCaptions = Array.isArray(rawBlock.captions) ? rawBlock.captions : [];
      const captions: Array<{
        id: string;
        text: string;
        anchor: 'top' | 'bottom' | 'left' | 'right' | 'center';
      }> = [];
      for (let capIdx = 0; capIdx < rawCaptions.length; capIdx++) {
        const rawCaption = asRecord(rawCaptions[capIdx]);
        if (!rawCaption) continue;
        const capText = asString(rawCaption.text);
        if (!capText || capText.trim().length === 0) continue;
        const anchor = asEnum(rawCaption.anchor, CAPTION_ANCHORS) ?? 'bottom';
        captions.push({
          id: asString(rawCaption.id) ?? `caption-${capIdx + 1}`,
          text: capText,
          anchor,
        });
      }

      blocks.push({
        id,
        kind: 'diagram_panel',
        ...(region_hint ? { region_hint } : {}),
        ...(title ? { title } : {}),
        ...(axes ? { axes } : {}),
        ...(shapes.length > 0 ? { shapes } : {}),
        ...(captions.length > 0 ? { captions } : {}),
      });
      continue;
    }

    if (kind === 'caption') {
      const text = asString(rawBlock.text) ?? asString(rawBlock.title);
      if (!text || text.trim().length === 0) {
        warnings.push(`Caption ${id} dropped: missing text`);
        continue;
      }

      const region_hint = asEnum(rawBlock.region_hint, CAPTION_REGION_HINTS) ?? undefined;
      blocks.push({
        id,
        kind: 'caption',
        text,
        ...(region_hint ? { region_hint } : {}),
      });
      continue;
    }

    warnings.push(`Unsupported semantic block kind at ${idx}`);
  }

  if (blocks.length === 0) {
    return { normalized: null, warnings: [...warnings, 'No valid semantic blocks in payload'] };
  }

  // Deduplicate block IDs — suffix duplicates with -2, -3, etc.
  const seenBlockIds = new Map<string, number>();
  for (const block of blocks) {
    const count = seenBlockIds.get(block.id) ?? 0;
    seenBlockIds.set(block.id, count + 1);
    if (count > 0) {
      const oldId = block.id;
      let suffix = count + 1;
      let newId = `${oldId}-${suffix}`;
      while (seenBlockIds.has(newId)) {
        suffix++;
        newId = `${oldId}-${suffix}`;
      }
      (block as { id: string }).id = newId;
      seenBlockIds.set(newId, 1);
      warnings.push(`Duplicate block id '${oldId}' renamed to '${newId}'`);
    }
  }

  const blockIds = new Set(blocks.map((b) => b.id));
  const rawRelations = Array.isArray(rec.relations) ? rec.relations.slice(0, 100) : [];
  if (Array.isArray(rec.relations) && rec.relations.length > 100) {
    warnings.push('Relations array truncated to 100 entries');
  }
  const relations: NonNullable<SemanticBatchInput['relations']> = [];
  for (let idx = 0; idx < rawRelations.length; idx++) {
    const rawRel = asRecord(rawRelations[idx]);
    if (!rawRel) continue;
    const type = asEnum(rawRel.type, RELATION_TYPES);
    const from_block_id = asString(rawRel.from_block_id);
    const to_block_id = asString(rawRel.to_block_id);
    if (!type || !from_block_id || !to_block_id) continue;
    if (from_block_id === to_block_id) {
      warnings.push(`Relation ${asString(rawRel.id) ?? idx} is self-referencing; dropped`);
      continue;
    }
    if (!blockIds.has(from_block_id) || !blockIds.has(to_block_id)) {
      warnings.push(`Relation ${asString(rawRel.id) ?? idx} references non-existent block`);
      continue;
    }
    relations.push({
      id: asString(rawRel.id) ?? `rel-${idx + 1}`,
      type,
      from_block_id,
      to_block_id,
      ...(asString(rawRel.from_anchor) ? { from_anchor: asString(rawRel.from_anchor)! } : {}),
      ...(asString(rawRel.to_anchor) ? { to_anchor: asString(rawRel.to_anchor)! } : {}),
      ...(asString(rawRel.label) ? { label: asString(rawRel.label)! } : {}),
    });
  }

  // Cycle detection via DFS on the relation adjacency graph
  const filteredRelations = filterCyclicRelations(relations, warnings);

  const normalized: SemanticBatchInput = {
    batch_id,
    template,
    blocks,
    ...(style_preset ? { style_preset } : {}),
    ...(filteredRelations.length > 0 ? { relations: filteredRelations } : {}),
    ...(intent ? { intent } : {}),
  };

  return { normalized, warnings };
}

function filterCyclicRelations(
  relations: NonNullable<SemanticBatchInput['relations']>,
  warnings: string[],
): NonNullable<SemanticBatchInput['relations']> {
  // Build adjacency list and check for cycles using DFS
  const adj = new Map<string, Set<string>>();
  const result: NonNullable<SemanticBatchInput['relations']> = [];

  for (const rel of relations) {
    // Try adding edge; if it creates a cycle, skip it
    if (!adj.has(rel.from_block_id)) adj.set(rel.from_block_id, new Set());
    const neighbors = adj.get(rel.from_block_id)!;
    neighbors.add(rel.to_block_id);

    if (hasCycle(adj)) {
      neighbors.delete(rel.to_block_id);
      if (neighbors.size === 0) adj.delete(rel.from_block_id);
      warnings.push(`Relation ${rel.id} creates a cycle; dropped`);
    } else {
      result.push(rel);
    }
  }

  return result;
}

function hasCycle(adj: Map<string, Set<string>>): boolean {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();

  for (const node of adj.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const stack: Array<{ node: string; iter: Iterator<string> }> = [];
      color.set(node, GRAY);
      stack.push({ node, iter: (adj.get(node) ?? new Set()).values() });

      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const next = top.iter.next();
        if (next.done) {
          color.set(top.node, BLACK);
          stack.pop();
        } else {
          const neighbor = next.value;
          const c = color.get(neighbor) ?? WHITE;
          if (c === GRAY) return true;
          if (c === WHITE) {
            color.set(neighbor, GRAY);
            stack.push({ node: neighbor, iter: (adj.get(neighbor) ?? new Set()).values() });
          }
        }
      }
    }
  }
  return false;
}
