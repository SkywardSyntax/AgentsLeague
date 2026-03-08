import { z } from 'zod';
import type { DrawElement, SemanticBatch } from '@/types/agent';

// ── Coordinate clamping ────────────────────────────────────────────────

const COORD_MIN = -50000;
const COORD_MAX = 50000;

function clampCoord(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(COORD_MIN, Math.min(COORD_MAX, v));
}

function clampDimension(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(COORD_MAX, v);
}

// ── Point schema ───────────────────────────────────────────────────────

const PointSchema = z.object({ x: z.number(), y: z.number() });

// ── DrawElement variant schemas ────────────────────────────────────────

const BaseFields = {
  id: z.string(),
  color: z.string().optional(),
  stroke_width: z.number().optional(),
};

const RectSchema = z.object({
  ...BaseFields,
  type: z.literal('rect'),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
}).passthrough();

const EllipseSchema = z.object({
  ...BaseFields,
  type: z.literal('ellipse'),
  cx: z.number(),
  cy: z.number(),
  rx: z.number(),
  ry: z.number(),
}).passthrough();

const LineSchema = z.object({
  ...BaseFields,
  type: z.literal('line'),
  from: PointSchema,
  to: PointSchema,
}).passthrough();

const ArrowSchema = z.object({
  ...BaseFields,
  type: z.literal('arrow'),
  from: PointSchema,
  to: PointSchema,
}).passthrough();

const TextSchema = z.object({
  ...BaseFields,
  type: z.literal('text'),
  x: z.number(),
  y: z.number(),
  text: z.string(),
  size: z.number().optional(),
}).passthrough();

const LatexSchema = z.object({
  ...BaseFields,
  type: z.literal('latex'),
  x: z.number(),
  y: z.number(),
  tex: z.string(),
  displayMode: z.boolean().optional(),
  fontSize: z.number().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
}).passthrough();

const ClearSchema = z.object({
  ...BaseFields,
  type: z.literal('clear'),
}).passthrough();

const DrawElementSchema = z.discriminatedUnion('type', [
  RectSchema,
  EllipseSchema,
  LineSchema,
  ArrowSchema,
  TextSchema,
  LatexSchema,
  ClearSchema,
]);

// ── Coordinate clamping per element type ───────────────────────────────

function clampElement(el: DrawElement): DrawElement {
  switch (el.type) {
    case 'rect':
      return { ...el, x: clampCoord(el.x), y: clampCoord(el.y), w: clampDimension(el.w), h: clampDimension(el.h) };
    case 'ellipse':
      return { ...el, cx: clampCoord(el.cx), cy: clampCoord(el.cy), rx: clampDimension(el.rx), ry: clampDimension(el.ry) };
    case 'line':
    case 'arrow':
      return {
        ...el,
        from: { x: clampCoord(el.from.x), y: clampCoord(el.from.y) },
        to: { x: clampCoord(el.to.x), y: clampCoord(el.to.y) },
      };
    case 'text':
      return { ...el, x: clampCoord(el.x), y: clampCoord(el.y) };
    case 'latex':
      return { ...el, x: clampCoord(el.x), y: clampCoord(el.y) };
    case 'clear':
      return el;
    // Math primitives — coordinates validated by schema; pass through as-is
    case 'cartesian_axes':
    case 'number_line':
    case 'vector_arrow':
    case 'function_curve':
    case 'matrix_bracket':
    case 'angle_arc':
    case 'integral_region':
    case 'slope_field':
    case 'vector_field_2d':
    case 'wireframe_3d':
    case 'complex_plane':
    case 'number_theory_grid':
    case 'conic_section':
    case 'coordinate_grid':
    case 'probability_tree':
    case 'scatter_plot':
    case 'symbol_grid':
    case 'equation_system':
    case 'annotation_arrow':
    case 'formula_box':
    case 'venn_diagram':
    case 'truth_table':
      return el;
    default:
      return el;
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export function sanitizeScene(raw: unknown[]): { valid: DrawElement[]; dropped: number } {
  const seen = new Set<string>();
  const valid: DrawElement[] = [];
  let dropped = 0;

  for (const item of raw) {
    const result = DrawElementSchema.safeParse(item);
    if (!result.success) {
      dropped++;
      continue;
    }
    const el = clampElement(result.data as DrawElement);
    // Deduplicate by ID (keep last)
    if (seen.has(el.id)) {
      const idx = valid.findIndex((v) => v.id === el.id);
      if (idx !== -1) valid.splice(idx, 1);
    }
    seen.add(el.id);
    valid.push(el);
  }

  if (dropped > 0) {
    console.warn(`[sanitizeScene] Dropped ${dropped} invalid element(s)`);
  }
  return { valid, dropped };
}

const SemanticBatchSchema = z.object({
  batch_id: z.string(),
  template: z.string(),
  blocks: z.array(z.object({
    kind: z.string(),
  }).passthrough()),
}).passthrough();

export function sanitizeSemanticScene(raw: unknown[]): SemanticBatch[] {
  const valid: SemanticBatch[] = [];
  let dropped = 0;

  for (const item of raw) {
    const result = SemanticBatchSchema.safeParse(item);
    if (!result.success) {
      dropped++;
      continue;
    }
    valid.push(result.data as unknown as SemanticBatch);
  }

  if (dropped > 0) {
    console.warn(`[sanitizeSemanticScene] Dropped ${dropped} invalid batch(es)`);
  }
  return valid;
}
