import { z } from 'zod';

// ─── Primitives ──────────────────────────────────────────

export const PointSchema = z.object({ x: z.number(), y: z.number() });

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);

export const FillStyleSchema = z.object({
  type: z.enum(['solid', 'none']),
  color: HexColorSchema,
  opacity: z.number().min(0).max(1),
});

export const StrokeStyleSchema = z.object({
  color: HexColorSchema,
  width: z.number().positive(),
  dashArray: z.array(z.number()).optional(),
  lineCap: z.enum(['butt', 'round', 'square']),
  lineJoin: z.enum(['miter', 'round', 'bevel']),
});

export const TextStyleSchema = z.object({
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  fontWeight: z.union([
    z.literal(400),
    z.literal(500),
    z.literal(600),
    z.literal(700),
  ]),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
  color: HexColorSchema,
  align: z.enum(['left', 'center', 'right']),
});

// ─── Base fields ─────────────────────────────────────────

const BaseElementFields = {
  id: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  locked: z.boolean(),
  groupId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
};

// ─── Element Schemas ─────────────────────────────────────

export const RectElementSchema = z.object({
  ...BaseElementFields,
  type: z.literal('rect'),
  w: z.number().positive(),
  h: z.number().positive(),
  cornerRadius: z.number().min(0),
  fill: FillStyleSchema,
  stroke: StrokeStyleSchema,
});

export const EllipseElementSchema = z.object({
  ...BaseElementFields,
  type: z.literal('ellipse'),
  rx: z.number().positive(),
  ry: z.number().positive(),
  fill: FillStyleSchema,
  stroke: StrokeStyleSchema,
});

export const LineElementSchema = z.object({
  ...BaseElementFields,
  type: z.literal('line'),
  points: z.array(PointSchema).min(2),
  stroke: StrokeStyleSchema,
});

export const ArrowElementSchema = z.object({
  ...BaseElementFields,
  type: z.literal('arrow'),
  points: z.array(PointSchema).min(2),
  stroke: StrokeStyleSchema,
  startArrowhead: z.enum(['none', 'arrow', 'dot']),
  endArrowhead: z.enum(['none', 'arrow', 'dot']),
  startBindingId: z.string().optional(),
  endBindingId: z.string().optional(),
});

export const FreehandElementSchema = z.object({
  ...BaseElementFields,
  type: z.literal('freehand'),
  points: z.array(PointSchema),
  pressures: z.array(z.number()).optional(),
  stroke: StrokeStyleSchema,
});

export const TextElementSchema = z.object({
  ...BaseElementFields,
  type: z.literal('text'),
  content: z.string(),
  w: z.number(),
  h: z.number(),
  style: TextStyleSchema,
});

export const ImageElementSchema = z.object({
  ...BaseElementFields,
  type: z.literal('image'),
  src: z.string(),
  w: z.number().positive(),
  h: z.number().positive(),
  naturalWidth: z.number().positive(),
  naturalHeight: z.number().positive(),
});

export const DrawElementSchema = z.discriminatedUnion('type', [
  RectElementSchema,
  EllipseElementSchema,
  LineElementSchema,
  ArrowElementSchema,
  FreehandElementSchema,
  TextElementSchema,
  ImageElementSchema,
]);

// ─── Draw Operations ─────────────────────────────────────

export const DrawOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), element: DrawElementSchema }),
  z.object({
    op: z.literal('update'),
    id: z.string(),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({ op: z.literal('delete'), id: z.string() }),
  z.object({ op: z.literal('clear') }),
]);
