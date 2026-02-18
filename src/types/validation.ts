/**
 * Zod schemas — the single source of truth for runtime validation.
 *
 * TypeScript types are inferred from schemas via z.infer<> so they
 * can never drift apart from the runtime checks.
 */

import { z } from 'zod';

// ── Primitive schemas ───────────────────────────────────────────────

export const ChannelValueSchema = z.number().int().min(0).max(255);
export const UnitFloatSchema = z.number().min(0).max(1);
export const PositivePxSchema = z.number().positive().finite();
export const CoordinateSchema = z.number().finite();
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const RGBAColorSchema = z
  .object({
    r: ChannelValueSchema,
    g: ChannelValueSchema,
    b: ChannelValueSchema,
    a: UnitFloatSchema,
  })
  .strict();

export const ColorSchema = z.union([RGBAColorSchema, HexColorSchema]);

export const PositionSchema = z
  .object({
    x: CoordinateSchema,
    y: CoordinateSchema,
  })
  .strict();

export const DimensionsSchema = z
  .object({
    width: PositivePxSchema,
    height: PositivePxSchema,
  })
  .strict();

export const FontWeightSchema = z.union([
  z.literal(100),
  z.literal(200),
  z.literal(300),
  z.literal(400),
  z.literal(500),
  z.literal(600),
  z.literal(700),
  z.literal(800),
  z.literal(900),
]);

export const FontSchema = z
  .object({
    family: z.string().min(1),
    size: PositivePxSchema,
    weight: FontWeightSchema,
    style: z.enum(['normal', 'italic', 'oblique']),
    lineHeight: z.union([UnitFloatSchema, PositivePxSchema]),
  })
  .strict();

// ── Shape schemas (discriminated union on `kind`) ───────────────────

const ShapeBaseSchema = z.object({
  id: z.string().min(1),
  position: PositionSchema,
  rotation: z.number(),
  opacity: UnitFloatSchema,
  fill: ColorSchema,
  stroke: ColorSchema,
  strokeWidth: PositivePxSchema,
});

// Base without fill for line-like shapes
const ShapeBaseNoFillSchema = ShapeBaseSchema.omit({ fill: true });

export const RectangleShapeSchema = ShapeBaseSchema.extend({
  kind: z.literal('rectangle'),
  dimensions: DimensionsSchema,
  borderRadius: PositivePxSchema,
}).strict();

export const EllipseShapeSchema = ShapeBaseSchema.extend({
  kind: z.literal('ellipse'),
  radiusX: PositivePxSchema,
  radiusY: PositivePxSchema,
}).strict();

export const LineShapeSchema = ShapeBaseNoFillSchema.extend({
  kind: z.literal('line'),
  start: PositionSchema,
  end: PositionSchema,
}).strict();

export const ArrowShapeSchema = ShapeBaseNoFillSchema.extend({
  kind: z.literal('arrow'),
  start: PositionSchema,
  end: PositionSchema,
  startArrowhead: z.enum(['none', 'arrow', 'dot']),
  endArrowhead: z.enum(['none', 'arrow', 'dot']),
}).strict();

export const FreehandShapeSchema = ShapeBaseNoFillSchema.extend({
  kind: z.literal('freehand'),
  points: z.array(PositionSchema).min(2),
  pressures: z.array(z.number().min(0).max(1)).optional(),
}).strict();

export const TextShapeSchema = ShapeBaseSchema.extend({
  kind: z.literal('text'),
  content: z.string(),
  font: FontSchema,
  maxWidth: PositivePxSchema.nullable(),
  align: z.enum(['left', 'center', 'right']),
}).strict();

export const ImageShapeSchema = ShapeBaseSchema.extend({
  kind: z.literal('image'),
  src: z.string().url(),
  dimensions: DimensionsSchema,
  alt: z.string(),
}).strict();

// ── DrawingShape discriminated union schema ──────────────────────────

export const DrawingShapeSchema = z.discriminatedUnion('kind', [
  RectangleShapeSchema,
  EllipseShapeSchema,
  LineShapeSchema,
  ArrowShapeSchema,
  FreehandShapeSchema,
  TextShapeSchema,
  ImageShapeSchema,
]);

// ── DrawingSpec (full response from OpenAI) ─────────────────────────

export const DrawingSpecSchema = z.object({
  shapes: z.array(DrawingShapeSchema).min(1),
  canvasSize: DimensionsSchema,
  background: ColorSchema,
  title: z.string().optional(),
  description: z.string().optional(),
});

// ── Inferred TypeScript types ───────────────────────────────────────

export type ZChannelValue = z.infer<typeof ChannelValueSchema>;
export type ZUnitFloat = z.infer<typeof UnitFloatSchema>;
export type ZPositivePx = z.infer<typeof PositivePxSchema>;
export type ZCoordinate = z.infer<typeof CoordinateSchema>;
export type ZHexColor = z.infer<typeof HexColorSchema>;
export type ZRGBAColor = z.infer<typeof RGBAColorSchema>;
export type ZColor = z.infer<typeof ColorSchema>;
export type ZPosition = z.infer<typeof PositionSchema>;
export type ZDimensions = z.infer<typeof DimensionsSchema>;
export type ZFont = z.infer<typeof FontSchema>;

export type ZRectangleShape = z.infer<typeof RectangleShapeSchema>;
export type ZEllipseShape = z.infer<typeof EllipseShapeSchema>;
export type ZLineShape = z.infer<typeof LineShapeSchema>;
export type ZArrowShape = z.infer<typeof ArrowShapeSchema>;
export type ZFreehandShape = z.infer<typeof FreehandShapeSchema>;
export type ZTextShape = z.infer<typeof TextShapeSchema>;
export type ZImageShape = z.infer<typeof ImageShapeSchema>;
export type ZDrawingShape = z.infer<typeof DrawingShapeSchema>;
export type ZDrawingSpec = z.infer<typeof DrawingSpecSchema>;

// ── Parse helpers ───────────────────────────────────────────────────

export function parseShape(raw: unknown): ZDrawingShape {
  return DrawingShapeSchema.parse(raw);
}

export function safeParseShape(raw: unknown) {
  return DrawingShapeSchema.safeParse(raw);
}

export function parseDrawingSpec(raw: unknown): ZDrawingSpec {
  return DrawingSpecSchema.parse(raw);
}

export function safeParseDrawingSpec(raw: unknown) {
  return DrawingSpecSchema.safeParse(raw);
}
