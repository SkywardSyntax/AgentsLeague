import { z } from 'zod';
import { COORD_MIN, COORD_MAX } from '@/lib/whiteboard/coord-bounds';
import { parseMathExpression } from '@/lib/whiteboard/graph-script';
import type { TreeNodeSpec } from '@/types/agent';

/** Validate a math expression string without evaluating it. */
function validateExpression(expr: string): { valid: boolean; error?: string } {
  try {
    // Normalize JS-style Math.fn() calls to bare fn() for the parser
    const normalized = expr.replace(/\bMath\./g, '');
    const fn = parseMathExpression(normalized);
    if (!fn) return { valid: false, error: `Invalid expression: "${expr}"` };
    return { valid: true };
  } catch {
    return { valid: false, error: `Parse error in expression: "${expr}"` };
  }
}

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
    color: z.string().max(30).regex(COLOR_REGEX).optional(),
    label: z.string().max(100).optional(),
  })).max(50).optional(),
  intervals: z.array(z.object({
    from: z.number().finite(),
    to: z.number().finite(),
    color: z.string().max(30).regex(COLOR_REGEX).optional(),
  })).max(50).optional(),
  region: z.object({
    start: z.number().finite(),
    end: z.number().finite(),
    color: z.string().max(30).regex(COLOR_REGEX).optional(),
  }).optional(),
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
  rows: z.union([
    z.array(z.array(z.string().max(200)).min(1).max(20)).min(1).max(20),
    z.string().max(2000),
  ]),
  bracketStyle: z.enum(['[]', '()', '||', '{}']),
  cellWidth: z.number().positive().max(COORD_MAX).optional(),
  cellHeight: z.number().positive().max(COORD_MAX).optional(),
  augmentedAt: z.number().int().min(1).max(19).optional(),
  style: StylePresetSchema.optional(),
});

const LinearTransformSchema = BaseElementSchema.extend({
  type: z.literal('linear_transform'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  width: z.number().positive().max(COORD_MAX),
  height: z.number().positive().max(COORD_MAX),
  matrix: z.tuple([
    z.tuple([z.number().finite(), z.number().finite()]),
    z.tuple([z.number().finite(), z.number().finite()]),
  ]),
  vectors: z.array(z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    label: z.string().max(100).optional(),
    color: z.string().max(30).regex(COLOR_REGEX).optional(),
  })).max(20).optional(),
  showBasisVectors: z.boolean().optional(),
  showOriginalGrid: z.boolean().optional(),
  gridRange: z.number().positive().max(20).optional(),
  label: z.string().max(200).optional(),
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

const HistogramBinSchema = z.object({
  label: z.string().max(100),
  value: z.number().finite(),
  color: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
});

const HistogramSchema = BaseElementSchema.extend({
  type: z.literal('histogram'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  width: z.number().positive().max(COORD_MAX),
  height: z.number().positive().max(COORD_MAX),
  bins: z.array(HistogramBinSchema).min(1).max(100),
  showValues: z.boolean().optional(),
  showAxes: z.boolean().optional(),
  yMax: z.number().finite().positive().optional(),
  xLabel: z.string().max(200).optional(),
  yLabel: z.string().max(200).optional(),
  style: StylePresetSchema.optional(),
});

const NormalDistributionSchema = BaseElementSchema.extend({
  type: z.literal('normal_distribution'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  width: z.number().positive().max(COORD_MAX),
  height: z.number().positive().max(COORD_MAX),
  mu: z.number().finite(),
  sigma: z.number().finite().positive(),
  shadeFrom: z.number().finite().optional(),
  shadeTo: z.number().finite().optional(),
  shadeColor: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
  showMeanLine: z.boolean().optional(),
  showSigmaLines: z.boolean().optional(),
  showLabels: z.boolean().optional(),
  style: StylePresetSchema.optional(),
});

const ComplexPlanePointSchema = z.object({
  re: z.number().finite(),
  im: z.number().finite(),
  label: z.string().max(100).optional(),
  color: z.string().max(30).regex(COLOR_REGEX).optional(),
});

const ComplexPlaneSchema = BaseElementSchema.extend({
  type: z.literal('complex_plane'),
  points: z.array(ComplexPlanePointSchema).max(50).optional(),
  vectors: z.array(ComplexPlanePointSchema).max(50).optional(),
  showUnitCircle: z.boolean().optional(),
  xRange: z.tuple([z.number().finite(), z.number().finite()]).optional(),
  yRange: z.tuple([z.number().finite(), z.number().finite()]).optional(),
  strokeColor: z.string().max(30).regex(COLOR_REGEX).optional(),
});

const NumberTheoryGridHighlightSchema = z.object({
  i: z.number().int().nonnegative(),
  j: z.number().int().nonnegative(),
  color: z.string().max(30).regex(COLOR_REGEX).optional(),
  label: z.string().max(100).optional(),
});

const NumberTheoryGridSchema = BaseElementSchema.extend({
  type: z.literal('number_theory_grid'),
  n: z.number().int().min(1).max(20),
  highlights: z.array(NumberTheoryGridHighlightSchema).max(400),
  showConnections: z.boolean().optional(),
  modulus: z.number().int().min(1).max(100).optional(),
  cx: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  cy: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  cellSize: z.number().positive().max(200).optional(),
});

const ConicSectionSchema = BaseElementSchema.extend({
  type: z.literal('conic_section'),
  conicType: z.enum(['ellipse', 'hyperbola', 'parabola']),
  cx: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  cy: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  a: z.number().positive().max(COORD_MAX).optional(),
  b: z.number().positive().max(COORD_MAX).optional(),
  p: z.number().positive().max(COORD_MAX).optional(),
  horizontal: z.boolean().optional(),
  showFoci: z.boolean().optional(),
  showDirectrix: z.boolean().optional(),
  showAsymptotes: z.boolean().optional(),
  showVertices: z.boolean().optional(),
  showEquation: z.boolean().optional(),
  strokeColor: z.string().max(30).regex(COLOR_REGEX).optional(),
  label: z.string().max(200).optional(),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  scale: z.number().positive().max(1000).optional(),
});

const CoordinateGridSchema = BaseElementSchema.extend({
  type: z.literal('coordinate_grid'),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  width: z.number().positive().max(COORD_MAX).optional(),
  height: z.number().positive().max(COORD_MAX).optional(),
  majorSpacing: z.number().positive().max(COORD_MAX).optional(),
  minorSpacing: z.number().positive().max(COORD_MAX).optional(),
  majorColor: z.string().max(50).optional(),
  minorColor: z.string().max(50).optional(),
  showAxes: z.boolean().optional(),
  showLabels: z.boolean().optional(),
  xMin: z.number().finite().optional(),
  xMax: z.number().finite().optional(),
  yMin: z.number().finite().optional(),
  yMax: z.number().finite().optional(),
});

const SymbolGridSymbolSchema = z.object({
  latex: z.string().max(500),
  name: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
});

const SymbolGridSchema = BaseElementSchema.extend({
  type: z.literal('symbol_grid'),
  symbols: z.array(SymbolGridSymbolSchema).min(1).max(200),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  columns: z.number().int().positive().max(20).optional(),
  cellWidth: z.number().positive().max(400).optional(),
  cellHeight: z.number().positive().max(400).optional(),
  title: z.string().max(200).optional(),
  showNames: z.boolean().optional(),
});

const EquationSystemSchema = BaseElementSchema.extend({
  type: z.literal('equation_system'),
  equations: z.array(z.string().max(500)).min(1).max(50),
  title: z.string().max(200).optional(),
  showBrace: z.boolean().optional(),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  lineSpacing: z.number().positive().max(200).optional(),
  fontSize: z.number().positive().max(200).optional(),
});

const ComparisonChartSeriesSchema = z.object({
  name: z.string().max(100),
  values: z.array(z.number().finite()).min(1).max(100),
  color: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
});

const ComparisonChartSchema = BaseElementSchema.extend({
  type: z.literal('comparison_chart'),
  categories: z.array(z.string().max(100)).min(1).max(100),
  series: z.array(ComparisonChartSeriesSchema).min(1).max(20),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  width: z.number().positive().max(COORD_MAX).optional(),
  height: z.number().positive().max(COORD_MAX).optional(),
  xLabel: z.string().max(200).optional(),
  yLabel: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  barPadding: z.number().min(0).max(1).optional(),
  showValues: z.boolean().optional(),
  showLegend: z.boolean().optional(),
  horizontal: z.boolean().optional(),
});

const BoxPlotGroupSchema = z.object({
  label: z.string().max(100),
  min: z.number().finite(),
  q1: z.number().finite(),
  median: z.number().finite(),
  q3: z.number().finite(),
  max: z.number().finite(),
  outliers: z.array(z.number().finite()).max(100).optional(),
  color: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
});

const BoxPlotSchema = BaseElementSchema.extend({
  type: z.literal('box_plot'),
  groups: z.array(BoxPlotGroupSchema).min(1).max(50),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  width: z.number().positive().max(COORD_MAX).optional(),
  height: z.number().positive().max(COORD_MAX).optional(),
  xLabel: z.string().max(200).optional(),
  yLabel: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  showMean: z.boolean().optional(),
  orientation: z.enum(['vertical', 'horizontal']).optional(),
});

const AnnotationArrowSchema = BaseElementSchema.extend({
  type: z.literal('annotation_arrow'),
  text: z.string().max(500),
  isLatex: z.boolean().optional(),
  targetX: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  targetY: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  labelX: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  labelY: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  strokeColor: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
  fontSize: z.number().positive().max(200).optional(),
});

const FormulaBoxSchema = BaseElementSchema.extend({
  type: z.literal('formula_box'),
  formula: z.string().max(1000),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  width: z.number().positive().max(COORD_MAX).optional(),
  height: z.number().positive().max(COORD_MAX).optional(),
  borderColor: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
  fillColor: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
  padding: z.number().nonnegative().max(200).optional(),
  title: z.string().max(200).optional(),
});

const VennDiagramSetSchema = z.object({
  label: z.string().max(100),
  color: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
});

const VennDiagramSchema = BaseElementSchema.extend({
  type: z.literal('venn_diagram'),
  sets: z.array(VennDiagramSetSchema).min(2).max(3),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  radius: z.number().positive().max(COORD_MAX).optional(),
  intersectionLabel: z.string().max(200).optional(),
  leftOnlyLabel: z.string().max(200).optional(),
  rightOnlyLabel: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
});

const TruthTableSchema = BaseElementSchema.extend({
  type: z.literal('truth_table'),
  variables: z.array(z.string().max(50)).min(1).max(8),
  outputs: z.array(z.string().max(200)).min(1).max(20),
  rows: z.array(z.array(z.boolean())).optional(),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  cellWidth: z.number().positive().max(400).optional(),
  cellHeight: z.number().positive().max(200).optional(),
  headerColor: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
  trueColor: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
  falseColor: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
});

const IntervalDiagramIntervalSchema = z.object({
  start: z.number(),
  end: z.number(),
  startOpen: z.boolean().optional(),
  endOpen: z.boolean().optional(),
  color: z.string().max(60).regex(COLOR_OR_RGBA_REGEX).optional(),
  label: z.string().max(100).optional(),
});

const IntervalDiagramSchema = BaseElementSchema.extend({
  type: z.literal('interval_diagram'),
  intervals: z.array(IntervalDiagramIntervalSchema).min(1).max(50),
  xMin: z.number().optional(),
  xMax: z.number().optional(),
  x: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  y: z.number().finite().min(COORD_MIN).max(COORD_MAX),
  width: z.number().positive().max(COORD_MAX).optional(),
  title: z.string().max(200).optional(),
  showNotation: z.boolean().optional(),
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
  LinearTransformSchema,
  AngleArcSchema,
  IntegralRegionSchema,
  CircleWithRadiusSchema,
  TriangleWithAnglesSchema,
  HistogramSchema,
  NormalDistributionSchema,
  ComplexPlaneSchema,
  NumberTheoryGridSchema,
  ConicSectionSchema,
  CoordinateGridSchema,
  SymbolGridSchema,
  EquationSystemSchema,
  ComparisonChartSchema,
  BoxPlotSchema,
  AnnotationArrowSchema,
  FormulaBoxSchema,
  VennDiagramSchema,
  TruthTableSchema,
  IntervalDiagramSchema,
]);

const BatchSourceSchema = z.enum(['ai-stream', 'injection', 'template']).optional();

export const DrawBatchSchema = z.object({
  batch_id: z.string().min(1).max(64),
  style_preset: z.enum(['clean_pen_sketch', 'rough_sketch', 'blueprint_neat', 'mathematical']).optional(),
  elements: z.array(DrawElementSchema).max(200),
  source: BatchSourceSchema,
  schemaVersion: z.number().int().default(1),
}).superRefine((data, ctx) => {
  for (let i = 0; i < data.elements.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = data.elements[i] as any;
    if (el?.type === 'function_curve' && el.expression) {
      const v = validateExpression(el.expression as string);
      if (!v.valid) {
        ctx.addIssue({ code: 'custom', message: v.error ?? 'Invalid expression', path: ['elements', i, 'expression'] });
      }
    }
    if (el?.type === 'parametric_curve') {
      const vx = validateExpression(el.xExpression as string);
      if (!vx.valid) {
        ctx.addIssue({ code: 'custom', message: vx.error ?? 'Invalid xExpression', path: ['elements', i, 'xExpression'] });
      }
      const vy = validateExpression(el.yExpression as string);
      if (!vy.valid) {
        ctx.addIssue({ code: 'custom', message: vy.error ?? 'Invalid yExpression', path: ['elements', i, 'yExpression'] });
      }
    }
  }
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

const TreeNodeSpecSchema: z.ZodType<TreeNodeSpec> = z.lazy(() =>
  z.object({
    label: z.string().min(1),
    value: z.union([z.string(), z.number()]).optional(),
    color: z.string().optional(),
    children: z.array(TreeNodeSpecSchema).optional(),
  }),
);

const SemanticTreeDiagramBlockSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.literal('tree_node'),
  root: TreeNodeSpecSchema,
  cx: z.number(),
  cy: z.number(),
  levelHeight: z.number().optional(),
  nodeRadius: z.number().optional(),
  strokeColor: z.string().optional(),
});

const SemanticBlockSchema = z.discriminatedUnion('kind', [
  SemanticEquationStackBlockSchema,
  SemanticDiagramPanelBlockSchema,
  SemanticCaptionBlockSchema,
  SemanticTreeDiagramBlockSchema,
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
  template: z.enum(['equation_derivation_vertical', 'jacobian_mapping_2panel', 'freeform_semantic', 'probability_tree', 'tree_diagram']),
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
  'probability_tree',
  'tree_diagram',
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
export const TEMPLATES = ['equation_derivation_vertical', 'jacobian_mapping_2panel', 'freeform_semantic', 'probability_tree', 'tree_diagram'] as const;
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
      if (expression) {
        const exprValidation = validateExpression(expression);
        if (!exprValidation.valid) {
          warnings.push(`FunctionCurve ${id}: ${exprValidation.error}`);
        }
      }
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

    // parametric_curve: pass through with validation (lowered later)
    if (type === 'parametric_curve') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const width = asNumber(raw.width) ?? asNumber(raw.w);
      const height = asNumber(raw.height) ?? asNumber(raw.h);
      const rawXRange = Array.isArray(raw.xRange) ? raw.xRange : null;
      const rawYRange = Array.isArray(raw.yRange) ? raw.yRange : null;
      const tMin = asNumber(raw.tMin);
      const tMax = asNumber(raw.tMax);
      const xExpression = asString(raw.xExpression);
      const yExpression = asString(raw.yExpression);
      if (x == null || y == null || width == null || height == null || !rawXRange || !rawYRange || tMin == null || tMax == null || !xExpression || !yExpression) {
        warnings.push(`ParametricCurve ${id} has invalid coordinates, ranges, or expressions`);
        continue;
      }
      const xExprV = validateExpression(xExpression);
      if (!xExprV.valid) {
        warnings.push(`ParametricCurve ${id} xExpression: ${xExprV.error}`);
      }
      const yExprV = validateExpression(yExpression);
      if (!yExprV.valid) {
        warnings.push(`ParametricCurve ${id} yExpression: ${yExprV.error}`);
      }
      const xr0 = asNumber(rawXRange[0]);
      const xr1 = asNumber(rawXRange[1]);
      const yr0 = asNumber(rawYRange[0]);
      const yr1 = asNumber(rawYRange[1]);
      if (xr0 == null || xr1 == null || yr0 == null || yr1 == null) {
        warnings.push(`ParametricCurve ${id} has invalid range values`);
        continue;
      }
      const steps = asNumber(raw.steps) ?? undefined;
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
        tMin,
        tMax,
        xExpression,
        yExpression,
        ...(steps ? { steps } : {}),
        ...(label ? { label } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // polar_plot: pass through with validation (lowered later)
    if (type === 'polar_plot') {
      const cx = asNumber(raw.cx);
      const cy = asNumber(raw.cy);
      const radius = asNumber(raw.radius);
      const expression = asString(raw.expression);
      if (cx == null || cy == null || radius == null || !expression) {
        warnings.push(`PolarPlot ${id} has invalid center, radius, or expression`);
        continue;
      }
      const thetaMin = asNumber(raw.thetaMin) ?? undefined;
      const thetaMax = asNumber(raw.thetaMax) ?? undefined;
      const steps = asNumber(raw.steps) ?? undefined;
      const showPolarGrid = typeof raw.showPolarGrid === 'boolean' ? raw.showPolarGrid : undefined;
      const label = asString(raw.label) ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        cx,
        cy,
        radius: Math.max(1, Math.abs(radius)),
        expression,
        ...(thetaMin != null ? { thetaMin } : {}),
        ...(thetaMax != null ? { thetaMax } : {}),
        ...(steps ? { steps } : {}),
        ...(showPolarGrid != null ? { showPolarGrid } : {}),
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

    // riemann_sum: pass through with validation
    if (type === 'riemann_sum') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const width = asNumber(raw.width) ?? asNumber(raw.w);
      const height = asNumber(raw.height) ?? asNumber(raw.h);
      const rawXRange = Array.isArray(raw.xRange) ? raw.xRange : null;
      const rawYRange = Array.isArray(raw.yRange) ? raw.yRange : null;
      const expression = asString(raw.expression);
      if (x == null || y == null || width == null || height == null || !rawXRange || !rawYRange || !expression) {
        warnings.push(`RiemannSum ${id} has invalid coordinates, ranges, or expression`);
        continue;
      }
      const xr0 = asNumber(rawXRange[0]);
      const xr1 = asNumber(rawXRange[1]);
      const yr0 = asNumber(rawYRange[0]);
      const yr1 = asNumber(rawYRange[1]);
      if (xr0 == null || xr1 == null || yr0 == null || yr1 == null) {
        warnings.push(`RiemannSum ${id} has invalid range values`);
        continue;
      }
      const n = asNumber(raw.n) ?? undefined;
      const method = (raw.method === 'left' || raw.method === 'right' || raw.method === 'midpoint') ? raw.method : undefined;
      const showFunction = typeof raw.showFunction === 'boolean' ? raw.showFunction : undefined;
      const showAxes = typeof raw.showAxes === 'boolean' ? raw.showAxes : undefined;
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
        expression,
        ...(n != null ? { n } : {}),
        ...(method ? { method } : {}),
        ...(showFunction != null ? { showFunction } : {}),
        ...(showAxes != null ? { showAxes } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // tangent_line: pass through with validation
    if (type === 'tangent_line') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const width = asNumber(raw.width) ?? asNumber(raw.w);
      const height = asNumber(raw.height) ?? asNumber(raw.h);
      const rawXRange = Array.isArray(raw.xRange) ? raw.xRange : null;
      const rawYRange = Array.isArray(raw.yRange) ? raw.yRange : null;
      const expression = asString(raw.expression);
      const atX = asNumber(raw.atX);
      if (x == null || y == null || width == null || height == null || !rawXRange || !rawYRange || !expression || atX == null) {
        warnings.push(`TangentLine ${id} has invalid coordinates, ranges, expression, or atX`);
        continue;
      }
      const xr0 = asNumber(rawXRange[0]);
      const xr1 = asNumber(rawXRange[1]);
      const yr0 = asNumber(rawYRange[0]);
      const yr1 = asNumber(rawYRange[1]);
      if (xr0 == null || xr1 == null || yr0 == null || yr1 == null) {
        warnings.push(`TangentLine ${id} has invalid range values`);
        continue;
      }
      const length = asNumber(raw.length) ?? undefined;
      const showPoint = typeof raw.showPoint === 'boolean' ? raw.showPoint : undefined;
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
        expression,
        atX,
        ...(length != null ? { length } : {}),
        ...(showPoint != null ? { showPoint } : {}),
        ...(label ? { label } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // histogram: pass through with validation (lowered later)
    if (type === 'histogram') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const width = asNumber(raw.width) ?? asNumber(raw.w);
      const height = asNumber(raw.height) ?? asNumber(raw.h);
      if (x == null || y == null || width == null || height == null) {
        warnings.push(`Histogram ${id} has invalid coordinates`);
        continue;
      }
      const rawBins = Array.isArray(raw.bins) ? raw.bins : null;
      if (!rawBins || rawBins.length === 0) {
        warnings.push(`Histogram ${id} needs at least 1 bin`);
        continue;
      }
      const bins: Array<{ label: string; value: number; color?: string }> = [];
      for (const rb of rawBins) {
        const rec2 = asRecord(rb);
        if (!rec2) continue;
        const label2 = asString(rec2.label);
        const value = asNumber(rec2.value);
        if (!label2 || value == null) continue;
        const binColor = asString(rec2.color) ?? undefined;
        bins.push({ label: label2, value, ...(binColor ? { color: binColor } : {}) });
      }
      if (bins.length === 0) {
        warnings.push(`Histogram ${id} has no valid bins`);
        continue;
      }
      const showValues = typeof raw.showValues === 'boolean' ? raw.showValues : undefined;
      const showAxes = typeof raw.showAxes === 'boolean' ? raw.showAxes : undefined;
      const yMax = asNumber(raw.yMax) ?? undefined;
      const xLabel = asString(raw.xLabel) ?? undefined;
      const yLabel = asString(raw.yLabel) ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        x,
        y,
        width: Math.max(1, Math.abs(width)),
        height: Math.max(1, Math.abs(height)),
        bins,
        ...(showValues != null ? { showValues } : {}),
        ...(showAxes != null ? { showAxes } : {}),
        ...(yMax != null ? { yMax } : {}),
        ...(xLabel ? { xLabel } : {}),
        ...(yLabel ? { yLabel } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // normal_distribution: pass through with validation (lowered later)
    if (type === 'normal_distribution') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const width = asNumber(raw.width) ?? asNumber(raw.w);
      const height = asNumber(raw.height) ?? asNumber(raw.h);
      const mu = asNumber(raw.mu);
      const sigma = asNumber(raw.sigma);
      if (x == null || y == null || width == null || height == null || mu == null || sigma == null || sigma <= 0) {
        warnings.push(`NormalDistribution ${id} has invalid coordinates or parameters`);
        continue;
      }
      const shadeFrom = asNumber(raw.shadeFrom) ?? undefined;
      const shadeTo = asNumber(raw.shadeTo) ?? undefined;
      const shadeColor = asString(raw.shadeColor) ?? undefined;
      const showMeanLine = typeof raw.showMeanLine === 'boolean' ? raw.showMeanLine : undefined;
      const showSigmaLines = typeof raw.showSigmaLines === 'boolean' ? raw.showSigmaLines : undefined;
      const showLabels = typeof raw.showLabels === 'boolean' ? raw.showLabels : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        x,
        y,
        width: Math.max(1, Math.abs(width)),
        height: Math.max(1, Math.abs(height)),
        mu,
        sigma,
        ...(shadeFrom != null ? { shadeFrom } : {}),
        ...(shadeTo != null ? { shadeTo } : {}),
        ...(shadeColor ? { shadeColor } : {}),
        ...(showMeanLine != null ? { showMeanLine } : {}),
        ...(showSigmaLines != null ? { showSigmaLines } : {}),
        ...(showLabels != null ? { showLabels } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // slope_field: pass through with validation (lowered later)
    if (type === 'slope_field') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const width = asNumber(raw.width) ?? asNumber(raw.w);
      const height = asNumber(raw.height) ?? asNumber(raw.h);
      const rawXRange = Array.isArray(raw.xRange) ? raw.xRange : null;
      const rawYRange = Array.isArray(raw.yRange) ? raw.yRange : null;
      const expression = asString(raw.expression);
      if (x == null || y == null || width == null || height == null || !rawXRange || !rawYRange || !expression) {
        warnings.push(`SlopeField ${id} has invalid coordinates, ranges, or expression`);
        continue;
      }
      const xr0 = asNumber(rawXRange[0]);
      const xr1 = asNumber(rawXRange[1]);
      const yr0 = asNumber(rawYRange[0]);
      const yr1 = asNumber(rawYRange[1]);
      if (xr0 == null || xr1 == null || yr0 == null || yr1 == null) {
        warnings.push(`SlopeField ${id} has invalid range values`);
        continue;
      }
      const gridRows = asNumber(raw.gridRows) ?? undefined;
      const gridCols = asNumber(raw.gridCols) ?? undefined;
      const strokeColor = asString(raw.strokeColor) ?? undefined;
      const strokeWidth = asNumber(raw.strokeWidth) ?? undefined;
      let solutionCurve: { x0: number; y0: number; steps?: number } | undefined;
      const rawSC = asRecord(raw.solutionCurve);
      if (rawSC) {
        const x0 = asNumber(rawSC.x0);
        const y0 = asNumber(rawSC.y0);
        if (x0 != null && y0 != null) {
          const steps = asNumber(rawSC.steps) ?? undefined;
          solutionCurve = { x0, y0, ...(steps != null ? { steps } : {}) };
        }
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
        expression,
        ...(gridRows != null ? { gridRows } : {}),
        ...(gridCols != null ? { gridCols } : {}),
        ...(strokeColor ? { strokeColor } : {}),
        ...(strokeWidth != null ? { strokeWidth } : {}),
        ...(solutionCurve ? { solutionCurve } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // vector_field_2d: pass through with validation (lowered later)
    if (type === 'vector_field_2d') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const width = asNumber(raw.width) ?? asNumber(raw.w);
      const height = asNumber(raw.height) ?? asNumber(raw.h);
      const rawXRange = Array.isArray(raw.xRange) ? raw.xRange : null;
      const rawYRange = Array.isArray(raw.yRange) ? raw.yRange : null;
      const Px = asString(raw.Px);
      const Py = asString(raw.Py);
      if (x == null || y == null || width == null || height == null || !rawXRange || !rawYRange || !Px || !Py) {
        warnings.push(`VectorField2d ${id} has invalid coordinates, ranges, or expressions`);
        continue;
      }
      const xr0 = asNumber(rawXRange[0]);
      const xr1 = asNumber(rawXRange[1]);
      const yr0 = asNumber(rawYRange[0]);
      const yr1 = asNumber(rawYRange[1]);
      if (xr0 == null || xr1 == null || yr0 == null || yr1 == null) {
        warnings.push(`VectorField2d ${id} has invalid range values`);
        continue;
      }
      const gridRows = asNumber(raw.gridRows) ?? undefined;
      const gridCols = asNumber(raw.gridCols) ?? undefined;
      const strokeColor = asString(raw.strokeColor) ?? undefined;
      const normalize = typeof raw.normalize === 'boolean' ? raw.normalize : undefined;
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
        Px,
        Py,
        ...(gridRows != null ? { gridRows } : {}),
        ...(gridCols != null ? { gridCols } : {}),
        ...(strokeColor ? { strokeColor } : {}),
        ...(normalize != null ? { normalize } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // wireframe_3d: pass through with validation (lowered later)
    if (type === 'wireframe_3d') {
      const cx = asNumber(raw.cx);
      const cy = asNumber(raw.cy);
      const size = asNumber(raw.size);
      const shape = asString(raw.shape);
      const validShapes = ['cube', 'tetrahedron', 'octahedron', 'axes_3d', 'surface'];
      if (cx == null || cy == null || size == null || !shape || !validShapes.includes(shape)) {
        warnings.push(`Wireframe3d ${id} has invalid cx/cy/size or shape`);
        continue;
      }
      const rotationX = asNumber(raw.rotationX) ?? undefined;
      const rotationY = asNumber(raw.rotationY) ?? undefined;
      const expression = asString(raw.expression) ?? undefined;
      const gridN = asNumber(raw.gridN) ?? undefined;
      const strokeColor = asString(raw.strokeColor) ?? undefined;
      const strokeWidth = asNumber(raw.strokeWidth) ?? undefined;
      const showHiddenLines = typeof raw.showHiddenLines === 'boolean' ? raw.showHiddenLines : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        shape,
        cx,
        cy,
        size: Math.max(1, Math.abs(size)),
        ...(rotationX != null ? { rotationX } : {}),
        ...(rotationY != null ? { rotationY } : {}),
        ...(expression ? { expression } : {}),
        ...(gridN != null ? { gridN } : {}),
        ...(strokeColor ? { strokeColor } : {}),
        ...(strokeWidth != null ? { strokeWidth } : {}),
        ...(showHiddenLines != null ? { showHiddenLines } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // sequence_plot: pass through with validation (lowered later)
    if (type === 'sequence_plot') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const width = asNumber(raw.width) ?? asNumber(raw.w);
      const height = asNumber(raw.height) ?? asNumber(raw.h);
      const expression = asString(raw.expression);
      if (x == null || y == null || width == null || height == null || !expression) {
        warnings.push(`SequencePlot ${id} has invalid coordinates or expression`);
        continue;
      }
      const exprV = validateExpression(expression);
      if (!exprV.valid) {
        warnings.push(`SequencePlot ${id} expression: ${exprV.error}`);
      }
      const nMin = asNumber(raw.nMin) ?? undefined;
      const nMax = asNumber(raw.nMax) ?? undefined;
      const limit = asNumber(raw.limit) ?? undefined;
      const rawXRange = Array.isArray(raw.xRange) ? raw.xRange : null;
      const rawYRange = Array.isArray(raw.yRange) ? raw.yRange : null;
      let xRange: [number, number] | undefined;
      if (rawXRange) {
        const xr0 = asNumber(rawXRange[0]);
        const xr1 = asNumber(rawXRange[1]);
        if (xr0 != null && xr1 != null) xRange = [xr0, xr1];
      }
      let yRange: [number, number] | undefined;
      if (rawYRange) {
        const yr0 = asNumber(rawYRange[0]);
        const yr1 = asNumber(rawYRange[1]);
        if (yr0 != null && yr1 != null) yRange = [yr0, yr1];
      }
      const strokeColor = asString(raw.strokeColor) ?? undefined;
      const dotRadius = asNumber(raw.dotRadius) ?? undefined;
      const showLines = typeof raw.showLines === 'boolean' ? raw.showLines : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        x,
        y,
        width: Math.max(1, Math.abs(width)),
        height: Math.max(1, Math.abs(height)),
        expression,
        ...(nMin != null ? { nMin } : {}),
        ...(nMax != null ? { nMax } : {}),
        ...(limit != null ? { limit } : {}),
        ...(xRange ? { xRange } : {}),
        ...(yRange ? { yRange } : {}),
        ...(strokeColor ? { strokeColor } : {}),
        ...(dotRadius != null ? { dotRadius } : {}),
        ...(showLines != null ? { showLines } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // bezier_curve: pass through with validation (lowered later)
    if (type === 'bezier_curve') {
      const rawPoints = Array.isArray(raw.points) ? raw.points : null;
      if (!rawPoints || rawPoints.length < 3) {
        warnings.push(`BezierCurve ${id} needs at least 3 control points`);
        continue;
      }
      const points: [number, number][] = [];
      for (const rp of rawPoints) {
        if (Array.isArray(rp) && rp.length >= 2) {
          const px = asNumber(rp[0]);
          const py = asNumber(rp[1]);
          if (px != null && py != null) points.push([px, py]);
        }
      }
      if (points.length < 3) {
        warnings.push(`BezierCurve ${id} has fewer than 3 valid control points`);
        continue;
      }
      const strokeColor = asString(raw.strokeColor) ?? undefined;
      const strokeWidth = asNumber(raw.strokeWidth) ?? undefined;
      const showControlPoints = typeof raw.showControlPoints === 'boolean' ? raw.showControlPoints : undefined;
      const showTangents = typeof raw.showTangents === 'boolean' ? raw.showTangents : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        points,
        ...(strokeColor ? { strokeColor } : {}),
        ...(strokeWidth != null ? { strokeWidth } : {}),
        ...(showControlPoints != null ? { showControlPoints } : {}),
        ...(showTangents != null ? { showTangents } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // symbol_grid: pass through with validation (lowered later)
    if (type === 'symbol_grid') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const rawSymbols = Array.isArray(raw.symbols) ? raw.symbols : null;
      if (x == null || y == null || !rawSymbols || rawSymbols.length === 0) {
        warnings.push(`SymbolGrid ${id} has invalid coordinates or empty symbols`);
        continue;
      }
      const symbols: Array<{ latex: string; name?: string; category?: string }> = [];
      for (const rs of rawSymbols) {
        const latex = asString((rs as Record<string, unknown>)?.latex);
        if (latex) {
          const name = asString((rs as Record<string, unknown>)?.name) ?? undefined;
          const category = asString((rs as Record<string, unknown>)?.category) ?? undefined;
          symbols.push({ latex, ...(name ? { name } : {}), ...(category ? { category } : {}) });
        }
      }
      if (symbols.length === 0) {
        warnings.push(`SymbolGrid ${id} has no valid symbols`);
        continue;
      }
      const columns = asNumber(raw.columns) ?? undefined;
      const cellWidth = asNumber(raw.cellWidth) ?? undefined;
      const cellHeight = asNumber(raw.cellHeight) ?? undefined;
      const title = asString(raw.title) ?? undefined;
      const showNames = typeof raw.showNames === 'boolean' ? raw.showNames : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        symbols,
        x,
        y,
        ...(columns != null ? { columns } : {}),
        ...(cellWidth != null ? { cellWidth } : {}),
        ...(cellHeight != null ? { cellHeight } : {}),
        ...(title ? { title } : {}),
        ...(showNames != null ? { showNames } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // equation_system: pass through with validation (lowered later)
    if (type === 'equation_system') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const rawEquations = Array.isArray(raw.equations) ? raw.equations : null;
      if (x == null || y == null || !rawEquations || rawEquations.length === 0) {
        warnings.push(`EquationSystem ${id} has invalid coordinates or empty equations`);
        continue;
      }
      const equations: string[] = [];
      for (const re of rawEquations) {
        const s = typeof re === 'string' ? re : null;
        if (s) equations.push(s);
      }
      if (equations.length === 0) {
        warnings.push(`EquationSystem ${id} has no valid equations`);
        continue;
      }
      const title = asString(raw.title) ?? undefined;
      const showBrace = typeof raw.showBrace === 'boolean' ? raw.showBrace : undefined;
      const lineSpacing = asNumber(raw.lineSpacing) ?? undefined;
      const fontSize = asNumber(raw.fontSize) ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        equations,
        x,
        y,
        ...(title ? { title } : {}),
        ...(showBrace != null ? { showBrace } : {}),
        ...(lineSpacing != null ? { lineSpacing } : {}),
        ...(fontSize != null ? { fontSize } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // annotation_arrow: curved callout arrow with text label
    if (type === 'annotation_arrow') {
      const text = asString(raw.text);
      const targetX = asNumber(raw.targetX);
      const targetY = asNumber(raw.targetY);
      const labelX = asNumber(raw.labelX);
      const labelY = asNumber(raw.labelY);
      if (!text || targetX == null || targetY == null || labelX == null || labelY == null) {
        warnings.push(`AnnotationArrow ${id} missing required fields (text, targetX/Y, labelX/Y)`);
        continue;
      }
      const fontSize = asNumber(raw.fontSize) ?? undefined;
      const isLatex = typeof raw.isLatex === 'boolean' ? raw.isLatex : undefined;
      const strokeColor = asString(raw.strokeColor) ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        text,
        targetX,
        targetY,
        labelX,
        labelY,
        ...(fontSize != null ? { fontSize } : {}),
        ...(isLatex != null ? { isLatex } : {}),
        ...(strokeColor ? { strokeColor } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // formula_box: bordered formula display with optional title
    if (type === 'formula_box') {
      const formula = asString(raw.formula);
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      if (!formula || x == null || y == null) {
        warnings.push(`FormulaBox ${id} missing required fields (formula, x, y)`);
        continue;
      }
      const width = asNumber(raw.width) ?? undefined;
      const height = asNumber(raw.height) ?? undefined;
      const fontSize = asNumber(raw.fontSize) ?? undefined;
      const borderColor = asString(raw.borderColor) ?? undefined;
      const fillColor = asString(raw.fillColor) ?? undefined;
      const padding = asNumber(raw.padding) ?? undefined;
      const title = asString(raw.title) ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        formula,
        x,
        y,
        ...(width != null ? { width } : {}),
        ...(height != null ? { height } : {}),
        ...(fontSize != null ? { fontSize } : {}),
        ...(borderColor ? { borderColor } : {}),
        ...(fillColor ? { fillColor } : {}),
        ...(padding != null ? { padding } : {}),
        ...(title ? { title } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // venn_diagram: overlapping circles with set labels
    if (type === 'venn_diagram') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const rawSets = Array.isArray(raw.sets) ? raw.sets : null;
      if (x == null || y == null || !rawSets || rawSets.length < 2) {
        warnings.push(`VennDiagram ${id} missing required fields (x, y, sets with >=2 items)`);
        continue;
      }
      const sets: Array<{ label: string; color?: string }> = [];
      for (const rs of rawSets) {
        const label = asString((rs as Record<string, unknown>)?.label);
        if (label) {
          const setColor = asString((rs as Record<string, unknown>)?.color) ?? undefined;
          sets.push({ label, ...(setColor ? { color: setColor } : {}) });
        }
      }
      if (sets.length < 2) {
        warnings.push(`VennDiagram ${id} needs at least 2 valid sets`);
        continue;
      }
      const radius = asNumber(raw.radius) ?? undefined;
      const intersectionLabel = asString(raw.intersectionLabel) ?? undefined;
      const leftOnlyLabel = asString(raw.leftOnlyLabel) ?? undefined;
      const rightOnlyLabel = asString(raw.rightOnlyLabel) ?? undefined;
      const title = asString(raw.title) ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        sets,
        x,
        y,
        ...(radius != null ? { radius } : {}),
        ...(intersectionLabel ? { intersectionLabel } : {}),
        ...(leftOnlyLabel ? { leftOnlyLabel } : {}),
        ...(rightOnlyLabel ? { rightOnlyLabel } : {}),
        ...(title ? { title } : {}),
        ...(color ? { color } : {}),
        ...(stroke_width ? { stroke_width } : {}),
      });
      continue;
    }

    // truth_table: logical truth table with auto-generated rows
    if (type === 'truth_table') {
      const x = asNumber(raw.x);
      const y = asNumber(raw.y);
      const rawVars = Array.isArray(raw.variables) ? raw.variables : null;
      if (x == null || y == null || !rawVars || rawVars.length === 0) {
        warnings.push(`TruthTable ${id} missing required fields (x, y, variables)`);
        continue;
      }
      const variables: string[] = [];
      for (const rv of rawVars) {
        const s = typeof rv === 'string' ? rv : null;
        if (s) variables.push(s);
      }
      if (variables.length === 0) {
        warnings.push(`TruthTable ${id} has no valid variables`);
        continue;
      }
      const rawOutputs = Array.isArray(raw.outputs) ? raw.outputs : undefined;
      const outputs: string[] | undefined = rawOutputs
        ? rawOutputs.filter((o): o is string => typeof o === 'string')
        : undefined;
      const cellWidth = asNumber(raw.cellWidth) ?? undefined;
      const cellHeight = asNumber(raw.cellHeight) ?? undefined;
      const headerColor = asString(raw.headerColor) ?? undefined;
      const trueColor = asString(raw.trueColor) ?? undefined;
      const falseColor = asString(raw.falseColor) ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (elements as any[]).push({
        id,
        type,
        variables,
        x,
        y,
        ...(outputs && outputs.length > 0 ? { outputs } : {}),
        ...(cellWidth != null ? { cellWidth } : {}),
        ...(cellHeight != null ? { cellHeight } : {}),
        ...(headerColor ? { headerColor } : {}),
        ...(trueColor ? { trueColor } : {}),
        ...(falseColor ? { falseColor } : {}),
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
export const DRAW_ELEMENT_TYPES = ['rect', 'ellipse', 'line', 'arrow', 'text', 'latex', 'clear', 'cartesian_axes', 'number_line', 'vector_arrow', 'function_curve', 'matrix_bracket', 'linear_transform', 'angle_arc', 'integral_region', 'circle_with_radius', 'triangle_with_angles', 'parametric_curve', 'polar_plot', 'riemann_sum', 'tangent_line', 'histogram', 'normal_distribution', 'slope_field', 'vector_field_2d', 'wireframe_3d', 'sequence_plot', 'bezier_curve', 'complex_plane', 'number_theory_grid', 'conic_section', 'coordinate_grid', 'symbol_grid', 'equation_system', 'comparison_chart', 'box_plot', 'annotation_arrow', 'formula_box', 'venn_diagram', 'truth_table', 'interval_diagram'] as const;
export const LATEX_ALIGN = ['left', 'center', 'right'] as const;
export const BLOCK_KINDS = ['equation_stack', 'diagram_panel', 'caption', 'root', 'branch', 'tree_node'] as const;

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

    // tree_node blocks are passed through with minimal validation
    if (kind === 'tree_node') {
      const root = asRecord(rawBlock.root);
      if (!root || !asString(root.label)) {
        warnings.push(`tree_node ${id} dropped: missing root or root.label`);
        continue;
      }
      // Pass through — validated at template level
      blocks.push(rawBlock as SemanticBatchInput['blocks'][number]);
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
