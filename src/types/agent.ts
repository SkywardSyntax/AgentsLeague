export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessageErrorMeta {
  code: string;
  retryable: boolean;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  errorMeta?: ChatMessageErrorMeta;
}

export type StylePreset = 'clean_pen_sketch' | 'rough_sketch' | 'blueprint_neat' | 'mathematical';
export type PlannerMode = 'semantic_preferred' | 'legacy_draw_only';

export interface Point {
  x: number;
  y: number;
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';

interface BaseDrawElement {
  id: string;
  color?: string;
  fillColor?: string;
  stroke_width?: number;
  lineStyle?: LineStyle;
}

export interface RectElement extends BaseDrawElement {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EllipseElement extends BaseDrawElement {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface LineElement extends BaseDrawElement {
  type: 'line';
  from: Point;
  to: Point;
}

export interface ArrowElement extends BaseDrawElement {
  type: 'arrow';
  from: Point;
  to: Point;
  label?: string;
}

export interface TextElement extends BaseDrawElement {
  type: 'text';
  x: number;
  y: number;
  text: string;
  size?: number;
  align?: 'left' | 'center' | 'right';
}

export interface LatexElement extends BaseDrawElement {
  type: 'latex';
  x: number;
  y: number;
  tex: string;
  displayMode?: boolean;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
}

export interface ClearElement extends BaseDrawElement {
  type: 'clear';
}

// --- P0 math drawing primitives ---

export interface CartesianAxesElement extends BaseDrawElement {
  type: 'cartesian_axes';
  /** Top-left corner of the plot area */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Numeric range for the x-axis, e.g. [-5, 5] */
  xRange: [number, number];
  /** Numeric range for the y-axis, e.g. [-3, 10] */
  yRange: [number, number];
  xLabel?: string;
  yLabel?: string;
  gridlines?: boolean;
  style?: StylePreset;
}

export interface NumberLineElement extends BaseDrawElement {
  type: 'number_line';
  x: number;
  y: number;
  length: number;
  min: number;
  max: number;
  label?: string;
  style?: StylePreset;
  /** Points to highlight with filled dots */
  highlights?: Array<{ value: number; color?: string; label?: string }>;
  /** Intervals to show as thicker line segments */
  intervals?: Array<{ from: number; to: number; color?: string }>;
  /** Shaded region on the number line (e.g. where f(x)>0) */
  region?: { start: number; end: number; color?: string };
}

export interface VectorArrowElement extends BaseDrawElement {
  type: 'vector_arrow';
  /** Tail position */
  x: number;
  y: number;
  /** Direction components */
  dx: number;
  dy: number;
  label?: string;
  color?: string;
  style?: StylePreset;
}

export interface MatrixBracketElement extends BaseDrawElement {
  type: 'matrix_bracket';
  x: number;
  y: number;
  /** Cell content — 2-D array or semicolon-separated string ("1 0; 0 1") */
  rows: string[][] | string;
  bracketStyle: '[]' | '()' | '||' | '{}';
  cellWidth?: number;
  cellHeight?: number;
  /** Column index where an augmented-matrix divider is drawn (e.g. 2 for [A|b]) */
  augmentedAt?: number;
  style?: StylePreset;
}

export interface LinearTransformElement extends BaseDrawElement {
  type: 'linear_transform';
  x: number;
  y: number;
  width: number;
  height: number;
  /** 2×2 transformation matrix [[a,b],[c,d]] */
  matrix: [[number, number], [number, number]];
  /** Extra vectors to show transformed (in math coords) */
  vectors?: Array<{ x: number; y: number; label?: string; color?: string }>;
  /** Show original & transformed basis vectors (default true) */
  showBasisVectors?: boolean;
  /** Show original grid (default true) */
  showOriginalGrid?: boolean;
  /** Grid range in math units (default 3 → shows -3 to 3) */
  gridRange?: number;
  label?: string;
  style?: StylePreset;
}

export interface FunctionCurveElement extends BaseDrawElement {
  type: 'function_curve';
  /** Canvas position of the plot-area origin (top-left) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Domain [min, max] */
  xRange: [number, number];
  /** Range [min, max] (for vertical scaling) */
  yRange: [number, number];
  /** Safe JS math expression, e.g. "Math.sin(x)" */
  expression?: string;
  /** Pre-sampled data points (preferred for AI use) */
  points?: Array<{ x: number; y: number }>;
  label?: string;
  style?: StylePreset;
}

export interface ParametricCurveElement extends BaseDrawElement {
  type: 'parametric_curve';
  /** Canvas position of the plot-area origin (top-left) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Math viewport X bounds [min, max] */
  xRange: [number, number];
  /** Math viewport Y bounds [min, max] */
  yRange: [number, number];
  /** Parameter range start */
  tMin: number;
  /** Parameter range end */
  tMax: number;
  /** Expression for x(t), e.g. "cos(t)" */
  xExpression: string;
  /** Expression for y(t), e.g. "sin(t)" */
  yExpression: string;
  /** Number of sample points (default 200) */
  steps?: number;
  label?: string;
  style?: StylePreset;
}

export interface PolarPlotElement extends BaseDrawElement {
  type: 'polar_plot';
  /** Canvas center X */
  cx: number;
  /** Canvas center Y */
  cy: number;
  /** Canvas scale (pixels per unit) */
  radius: number;
  /** r(θ) expression, e.g. "1 + cos(theta)" */
  expression: string;
  /** Theta range start (default 0) */
  thetaMin?: number;
  /** Theta range end (default 2π) */
  thetaMax?: number;
  /** Number of sample points (default 200) */
  steps?: number;
  /** Show polar grid (dashed r-circles and θ-lines) */
  showPolarGrid?: boolean;
  label?: string;
  style?: StylePreset;
}

export interface AngleArcElement extends BaseDrawElement {
  type: 'angle_arc';
  /** Vertex position */
  x: number;
  y: number;
  /** Arc radius */
  radius: number;
  /** Start angle in degrees (0 = right, CCW positive) */
  startAngle: number;
  /** End angle in degrees */
  endAngle: number;
  /** Label text, e.g. "45°" or "θ" */
  label?: string;
  style?: StylePreset;
}

export interface IntegralRegionElement extends BaseDrawElement {
  type: 'integral_region';
  /** Origin position */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Integration bounds [a, b] */
  xRange: [number, number];
  /** Y-axis scaling range */
  yRange: [number, number];
  /** Pre-sampled boundary points (top curve) — optional when expression is provided */
  topPoints?: Array<{ x: number; y: number }>;
  /** Bottom curve points; if absent, y=0 baseline is used */
  bottomPoints?: Array<{ x: number; y: number }>;
  /** Safe math expression for the top boundary, e.g. "x^2" */
  expression?: string;
  fillColor?: string;
  /** Opacity for the shaded fill region (0–1, default 0.3) */
  fillOpacity?: number;
  strokeColor?: string;
  /** Label text, e.g. "∫f(x)dx" */
  label?: string;
  /** Labels for the bounds; defaults to "a" / "b" */
  aLabel?: string;
  bLabel?: string;
  style?: StylePreset;
}

export interface RiemannSumElement extends BaseDrawElement {
  type: 'riemann_sum';
  x: number;
  y: number;
  width: number;
  height: number;
  xRange: [number, number];
  yRange: [number, number];
  /** f(x) expression, e.g. "x^2" */
  expression: string;
  /** Number of rectangles (default 5) */
  n?: number;
  /** Sampling method (default 'left') */
  method?: 'left' | 'right' | 'midpoint';
  /** Also draw f(x) curve on top (default true) */
  showFunction?: boolean;
  /** Draw cartesian axes (default true) */
  showAxes?: boolean;
  style?: StylePreset;
  color?: string;
}

export interface TangentLineElement extends BaseDrawElement {
  type: 'tangent_line';
  x: number;
  y: number;
  width: number;
  height: number;
  xRange: [number, number];
  yRange: [number, number];
  /** f(x) expression, e.g. "x^2" */
  expression: string;
  /** x value where the tangent is drawn */
  atX: number;
  /** Visible length of tangent in math units (default 2) */
  length?: number;
  /** Show the point of tangency (default true) */
  showPoint?: boolean;
  /** Label, e.g. "f'(2) = 4" */
  label?: string;
  style?: StylePreset;
  color?: string;
}

export interface CircleWithRadiusElement extends BaseDrawElement {
  type: 'circle_with_radius';
  cx: number;
  cy: number;
  r: number;
  label?: string;
  showCenter?: boolean;
  showRadius?: boolean;
  radiusAngle?: number;
  style?: StylePreset;
  color?: string;
}

export interface TriangleWithAnglesElement extends BaseDrawElement {
  type: 'triangle_with_angles';
  vertices: [
    { x: number; y: number; label?: string },
    { x: number; y: number; label?: string },
    { x: number; y: number; label?: string },
  ];
  showAngles?: boolean;
  showSides?: boolean;
  sideLabels?: [string?, string?, string?];
  angleLabels?: [string?, string?, string?];
  style?: StylePreset;
  color?: string;
}

export interface HistogramElement extends BaseDrawElement {
  type: 'histogram';
  x: number;
  y: number;
  width: number;
  height: number;
  bins: Array<{ label: string; value: number; color?: string }>;
  showValues?: boolean;
  showAxes?: boolean;
  yMax?: number;
  xLabel?: string;
  yLabel?: string;
  style?: StylePreset;
  color?: string;
}

export interface NormalDistributionCurveElement extends BaseDrawElement {
  type: 'normal_distribution';
  x: number;
  y: number;
  width: number;
  height: number;
  mu: number;
  sigma: number;
  shadeFrom?: number;
  shadeTo?: number;
  shadeColor?: string;
  showMeanLine?: boolean;
  showSigmaLines?: boolean;
  showLabels?: boolean;
  style?: StylePreset;
  color?: string;
}

export interface HistogramElement extends BaseDrawElement {
  type: 'histogram';
  x: number;
  y: number;
  width: number;
  height: number;
  bins: Array<{ label: string; value: number; color?: string }>;
  /** Maximum y-axis value; defaults to 1.2× the largest bin value */
  yMax?: number;
  /** Show value labels above each bar (default true) */
  showValues?: boolean;
  /** Show x/y axes (default true) */
  showAxes?: boolean;
  /** X-axis label */
  xLabel?: string;
  /** Y-axis label */
  yLabel?: string;
  label?: string;
  style?: StylePreset;
}

export interface NormalDistributionCurveElement extends BaseDrawElement {
  type: 'normal_distribution';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Mean (μ) */
  mu: number;
  /** Standard deviation (σ) */
  sigma: number;
  /** Shade the area under the curve from this x value */
  shadeFrom?: number;
  /** Shade the area under the curve to this x value */
  shadeTo?: number;
  /** Color for the shaded region */
  shadeColor?: string;
  /** Show the vertical mean line (default true) */
  showMeanLine?: boolean;
  /** Show vertical σ lines at ±1σ, ±2σ */
  showSigmaLines?: boolean;
  /** Show μ and σ labels on the x-axis */
  showLabels?: boolean;
  label?: string;
  style?: StylePreset;
}

export interface SlopeFieldElement extends BaseDrawElement {
  type: 'slope_field';
  /** Top-left corner of the plot area */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The ODE: dy/dx = expression(x, y), e.g. "x - y", "sin(x)*cos(y)" */
  expression: string;
  /** Math-domain X bounds */
  xRange: [number, number];
  /** Math-domain Y bounds */
  yRange: [number, number];
  /** Number of grid rows (default 12) */
  gridRows?: number;
  /** Number of grid columns (default 16) */
  gridCols?: number;
  strokeColor?: string;
  /** Tick mark stroke width */
  strokeWidth?: number;
  /** Optional solution curve traced via Euler's method */
  solutionCurve?: { x0: number; y0: number; steps?: number };
}

export interface VectorField2dElement extends BaseDrawElement {
  type: 'vector_field_2d';
  /** Top-left corner of the plot area */
  x: number;
  y: number;
  width: number;
  height: number;
  /** x-component expression F_x(x,y), e.g. "-y" */
  Px: string;
  /** y-component expression F_y(x,y), e.g. "x" */
  Py: string;
  /** Math-domain X bounds */
  xRange: [number, number];
  /** Math-domain Y bounds */
  yRange: [number, number];
  /** Number of grid rows (default 8) */
  gridRows?: number;
  /** Number of grid columns (default 10) */
  gridCols?: number;
  strokeColor?: string;
  /** If true, normalize all arrows to the same length */
  normalize?: boolean;
}

export interface Wireframe3dElement extends BaseDrawElement {
  type: 'wireframe_3d';
  /** 3D shape to render */
  shape: 'cube' | 'tetrahedron' | 'octahedron' | 'axes_3d' | 'surface';
  /** Camera rotation around X axis in degrees (default 20) */
  rotationX?: number;
  /** Camera rotation around Y axis in degrees (default 30) */
  rotationY?: number;
  /** Center X on canvas */
  cx: number;
  /** Center Y on canvas */
  cy: number;
  /** Edge length in pixels */
  size: number;
  /** For 'surface': z = expression(x, y) sampled over a grid, e.g. "sin(x)*cos(y)" */
  expression?: string;
  /** Surface grid density (default 8) */
  gridN?: number;
  strokeColor?: string;
  strokeWidth?: number;
  /** Show hidden lines using painter's algorithm (default false) */
  showHiddenLines?: boolean;
}

export interface SequencePlotElement extends BaseDrawElement {
  type: 'sequence_plot';
  /** The sequence a_n = expression(n), e.g. "1/n", "(-1)^n/n", "n*sin(1/n)" */
  expression: string;
  /** First index (default 1) */
  nMin?: number;
  /** Last index (default 20) */
  nMax?: number;
  /** Horizontal dashed convergence line at y = limit */
  limit?: number;
  /** Canvas x range; defaults to [nMin, nMax] */
  xRange?: [number, number];
  /** Canvas y range; auto-computed if omitted */
  yRange?: [number, number];
  strokeColor?: string;
  /** Dot radius in pixels (default 4) */
  dotRadius?: number;
  /** Connect consecutive dots with thin lines (default false) */
  showLines?: boolean;
  /** Top-left corner of the plot area */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BezierCurveElement extends BaseDrawElement {
  type: 'bezier_curve';
  /** Control points [x, y] — 3 = quadratic, 4 = cubic, more = polyBezier */
  points: [number, number][];
  strokeColor?: string;
  strokeWidth?: number;
  /** Show control polygon and control point dots (default false) */
  showControlPoints?: boolean;
  /** Show tangent lines at endpoints (default false) */
  showTangents?: boolean;
}

export interface ComplexPlaneElement extends BaseDrawElement {
  type: 'complex_plane';
  /** Points to mark on the complex plane */
  points?: Array<{ re: number; im: number; label?: string; color?: string }>;
  /** Vectors from origin */
  vectors?: Array<{ re: number; im: number; label?: string; color?: string }>;
  /** Show the unit circle */
  showUnitCircle?: boolean;
  /** Real axis range (default [-2, 2]) */
  xRange?: [number, number];
  /** Imaginary axis range (default [-2, 2]) */
  yRange?: [number, number];
  strokeColor?: string;
}

export interface NumberTheoryGridElement extends BaseDrawElement {
  type: 'number_theory_grid';
  /** Grid size (n × n), max 20 */
  n: number;
  /** Cells to highlight */
  highlights: Array<{ i: number; j: number; color?: string; label?: string }>;
  /** Show modular connection lines (connect i to j if i*j ≡ 0 mod n) */
  showConnections?: boolean;
  /** Modulus for connections (defaults to n) */
  modulus?: number;
  /** Center X of the grid */
  cx: number;
  /** Center Y of the grid */
  cy: number;
  /** Cell size in pixels (default 20) */
  cellSize?: number;
}

export interface ConicSectionElement extends BaseDrawElement {
  type: 'conic_section';
  /** Conic type */
  conicType: 'ellipse' | 'hyperbola' | 'parabola';
  /** Center x for ellipse/hyperbola, vertex x for parabola (math coords) */
  cx: number;
  /** Center y for ellipse/hyperbola, vertex y for parabola (math coords) */
  cy: number;
  /** Semi-major axis (ellipse/hyperbola), default 100 */
  a?: number;
  /** Semi-minor axis (ellipse/hyperbola), default 60 */
  b?: number;
  /** Distance to focus (parabola), default 40 */
  p?: number;
  /** Parabola opens right/left (true) or up/down (false), default false */
  horizontal?: boolean;
  /** Show foci markers, default true */
  showFoci?: boolean;
  /** Show directrix for parabola, default true */
  showDirectrix?: boolean;
  /** Show asymptotes for hyperbola, default true */
  showAsymptotes?: boolean;
  /** Show vertex markers, default true */
  showVertices?: boolean;
  /** Show equation as latex, default true */
  showEquation?: boolean;
  strokeColor?: string;
  label?: string;
  /** Canvas position of the center */
  x: number;
  /** Canvas position of the center */
  y: number;
  /** Pixels per unit, default 1 */
  scale?: number;
}

export interface CoordinateGridElement extends BaseDrawElement {
  type: 'coordinate_grid';
  /** Top-left canvas x */
  x: number;
  /** Top-left canvas y */
  y: number;
  /** Grid width in pixels, default 600 */
  width?: number;
  /** Grid height in pixels, default 400 */
  height?: number;
  /** Major gridline spacing in pixels, default 50 */
  majorSpacing?: number;
  /** Minor gridline spacing in pixels, default 10 */
  minorSpacing?: number;
  /** Major gridline color, default 'rgba(0,0,0,0.2)' */
  majorColor?: string;
  /** Minor gridline color, default 'rgba(0,0,0,0.08)' */
  minorColor?: string;
  /** Show bold x/y axes, default true */
  showAxes?: boolean;
  /** Show numeric labels on major gridlines, default true */
  showLabels?: boolean;
  /** Math x-axis min */
  xMin?: number;
  /** Math x-axis max */
  xMax?: number;
  /** Math y-axis min */
  yMin?: number;
  /** Math y-axis max */
  yMax?: number;
}

export interface ProbabilityTreeBranch {
  label: string;
  probability: number;
  children?: Array<{
    label: string;
    probability: number;
    finalProbability?: number;
  }>;
}

export interface ProbabilityTreeElement extends BaseDrawElement {
  type: 'probability_tree';
  /** Root event label */
  rootLabel?: string;
  /** Branches: each level is an array of options */
  branches: ProbabilityTreeBranch[];
  /** Top-left X position */
  x: number;
  /** Top-left Y position */
  y: number;
  /** Horizontal spacing between levels (default 120) */
  levelSpacing?: number;
  /** Vertical spacing between branches (default 60) */
  branchSpacing?: number;
  /** Show P(outcome) at leaf nodes (default true) */
  showFinalProb?: boolean;
}

export interface ScatterPlotElement extends BaseDrawElement {
  type: 'scatter_plot';
  /** Data points */
  points: Array<{
    x: number;
    y: number;
    label?: string;
    color?: string;
    size?: number;
  }>;
  /** Axis bounds (auto-computed from data if omitted) */
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  /** Axis labels */
  xLabel?: string;
  yLabel?: string;
  /** Chart title */
  title?: string;
  /** Show linear regression line */
  showRegressionLine?: boolean;
  /** Regression line color (default '#e74c3c') */
  regressionColor?: string;
  /** Top-left X position */
  x: number;
  /** Top-left Y position */
  y: number;
  /** Plot width (default 400) */
  width?: number;
  /** Plot height (default 300) */
  height?: number;
}

export interface SymbolGridElement extends BaseDrawElement {
  type: 'symbol_grid';
  /** Symbols to display — each with LaTeX and optional description */
  symbols: Array<{
    latex: string;
    name?: string;
    category?: string;
  }>;
  /** Top-left X position */
  x: number;
  /** Top-left Y position */
  y: number;
  /** Number of columns (default: sqrt(n) rounded) */
  columns?: number;
  /** Width of each cell in pixels (default 60) */
  cellWidth?: number;
  /** Height of each cell in pixels (default 50) */
  cellHeight?: number;
  /** Optional title above the grid */
  title?: string;
  /** Show text name below symbol (default true) */
  showNames?: boolean;
}

export interface EquationSystemElement extends BaseDrawElement {
  type: 'equation_system';
  /** Each equation as a LaTeX string */
  equations: string[];
  /** Optional title above the system */
  title?: string;
  /** Show a left curly brace (default true) */
  showBrace?: boolean;
  /** Top-left X position */
  x: number;
  /** Top-left Y position */
  y: number;
  /** Vertical gap between equations in pixels (default 35) */
  lineSpacing?: number;
  /** Font size for equations (default 16) */
  fontSize?: number;
}

export interface ComparisonChartElement extends BaseDrawElement {
  type: 'comparison_chart';
  /** X-axis category labels */
  categories: string[];
  /** One or more data series; each series has one value per category */
  series: Array<{
    name: string;
    values: number[];
    color?: string;
  }>;
  /** Top-left X position */
  x: number;
  /** Top-left Y position */
  y: number;
  /** Plot width (default 400) */
  width?: number;
  /** Plot height (default 250) */
  height?: number;
  /** X-axis label */
  xLabel?: string;
  /** Y-axis label */
  yLabel?: string;
  /** Chart title */
  title?: string;
  /** Padding between category groups, 0-1 (default 0.2) */
  barPadding?: number;
  /** Show value above each bar (default false) */
  showValues?: boolean;
  /** Show legend (default true if multiple series) */
  showLegend?: boolean;
  /** Horizontal bars (default false = vertical) */
  horizontal?: boolean;
}

export interface BoxPlotElement extends BaseDrawElement {
  type: 'box_plot';
  /** One or more box-and-whisker groups */
  groups: Array<{
    label: string;
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    outliers?: number[];
    mean?: number;
    color?: string;
  }>;
  /** Top-left X position */
  x: number;
  /** Top-left Y position */
  y: number;
  /** Plot width (default 400) */
  width?: number;
  /** Plot height (default 200) */
  height?: number;
  /** X-axis label */
  xLabel?: string;
  /** Y-axis label */
  yLabel?: string;
  /** Chart title */
  title?: string;
  /** Show mean as × marker (default false) */
  showMean?: boolean;
  /** Orientation (default 'vertical') */
  orientation?: 'vertical' | 'horizontal';
}

export interface AnnotationArrowElement extends BaseDrawElement {
  type: 'annotation_arrow';
  /** Text label for the annotation */
  text: string;
  /** X coordinate of the point being annotated */
  targetX: number;
  /** Y coordinate of the point being annotated */
  targetY: number;
  /** X coordinate where the label sits */
  labelX: number;
  /** Y coordinate where the label sits */
  labelY: number;
  /** Font size (default 16) */
  fontSize?: number;
  /** Stroke color (default '#333') */
  strokeColor?: string;
  /** Force LaTeX rendering (auto-detected if omitted) */
  isLatex?: boolean;
}

export interface FormulaBoxElement extends BaseDrawElement {
  type: 'formula_box';
  /** LaTeX formula string */
  formula: string;
  /** Top-left X */
  x: number;
  /** Top-left Y */
  y: number;
  /** Box width (auto-computed from formula length if omitted) */
  width?: number;
  /** Box height (auto-computed if omitted) */
  height?: number;
  /** Font size (default 16) */
  fontSize?: number;
  /** Border color (default '#333') */
  borderColor?: string;
  /** Fill color (default 'rgba(255,255,240,0.95)') */
  fillColor?: string;
  /** Inner padding (default 12) */
  padding?: number;
  /** Optional title above the formula */
  title?: string;
}

export interface VennDiagramElement extends BaseDrawElement {
  type: 'venn_diagram';
  /** 2 or 3 sets */
  sets: Array<{ label: string; color?: string }>;
  /** Center X */
  x: number;
  /** Center Y */
  y: number;
  /** Circle radius (default 80) */
  radius?: number;
  /** Intersection label */
  intersectionLabel?: string;
  /** Left-only region label */
  leftOnlyLabel?: string;
  /** Right-only region label */
  rightOnlyLabel?: string;
  /** Optional title */
  title?: string;
}

export interface TruthTableElement extends BaseDrawElement {
  type: 'truth_table';
  /** Variable column names */
  variables: string[];
  /** Output formula columns */
  outputs?: string[];
  /** Custom rows (auto-generated from variables if omitted) */
  rows?: Array<Record<string, boolean | string>>;
  /** Top-left X */
  x: number;
  /** Top-left Y */
  y: number;
  /** Cell width (default 60) */
  cellWidth?: number;
  /** Cell height (default 30) */
  cellHeight?: number;
  /** Header row color */
  headerColor?: string;
  /** True cell color */
  trueColor?: string;
  /** False cell color */
  falseColor?: string;
}

export interface PolygonElement extends BaseDrawElement {
  type: 'polygon';
  /** Explicit vertices — if provided, draw lines connecting them in order (closed) */
  vertices?: Array<{ x: number; y: number; label?: string }>;
  /** Number of sides for a regular polygon (3=triangle, 4=square, 5=pentagon, etc.) */
  sides?: number;
  /** Center X for regular polygon */
  centerX?: number;
  /** Center Y for regular polygon */
  centerY?: number;
  /** Circumradius for regular polygon (default 80) */
  radius?: number;
  /** Rotation in degrees for regular polygon (default 0) */
  rotationDeg?: number;
  /** Stroke color */
  strokeColor?: string;
  /** Fill color (default none) */
  fillColor?: string;
  /** Fill opacity (default 0.1) */
  fillOpacity?: number;
  /** Draw angle arcs at each vertex */
  showAngles?: boolean;
  /** Show side length labels at midpoints */
  showSideLabels?: boolean;
  /** Show vertex labels (A, B, C...) offset outward from center */
  showVertexLabels?: boolean;
  /** Optional title above the polygon */
  title?: string;
}

export interface GeometricConstructionElement extends BaseDrawElement {
  type: 'geometric_construction';
  /** Construction steps rendered in order */
  steps: Array<{
    type: 'point' | 'line' | 'circle' | 'arc' | 'angle_bisector' | 'perpendicular';
    /** Point X */
    x?: number;
    /** Point Y */
    y?: number;
    /** Label for a point or step */
    label?: string;
    /** Line/segment start X */
    x1?: number;
    /** Line/segment start Y */
    y1?: number;
    /** Line/segment end X */
    x2?: number;
    /** Line/segment end Y */
    y2?: number;
    /** Circle/arc center X */
    cx?: number;
    /** Circle/arc center Y */
    cy?: number;
    /** Circle/arc radius */
    r?: number;
    /** Arc start angle in degrees */
    startAngle?: number;
    /** Arc end angle in degrees */
    endAngle?: number;
    /** Tick marks on equal segments (1, 2, or 3) */
    ticks?: number;
    /** Step color */
    color?: string;
    /** Dashed for construction lines */
    dashed?: boolean;
  }>;
  /** Optional title above the construction */
  title?: string;
}

export interface IntervalDiagramElement extends BaseDrawElement {
  type: 'interval_diagram';
  /** The intervals to display */
  intervals: Array<{
    start: number;
    end: number;
    startOpen?: boolean;
    endOpen?: boolean;
    color?: string;
    label?: string;
  }>;
  /** Axis range left bound (auto from intervals if omitted) */
  xMin?: number;
  /** Axis range right bound (auto from intervals if omitted) */
  xMax?: number;
  /** Top-left X position */
  x: number;
  /** Top-left Y position */
  y: number;
  /** Width in pixels (default 400) */
  width?: number;
  /** Optional diagram title */
  title?: string;
  /** Show interval notation like [-2,3)∪(5,∞) as text below */
  showNotation?: boolean;
}

export type DrawElement =
  | RectElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | TextElement
  | LatexElement
  | ClearElement
  | CartesianAxesElement
  | NumberLineElement
  | VectorArrowElement
  | FunctionCurveElement
  | MatrixBracketElement
  | LinearTransformElement
  | AngleArcElement
  | IntegralRegionElement
  | CircleWithRadiusElement
  | TriangleWithAnglesElement
  | ParametricCurveElement
  | PolarPlotElement
  | RiemannSumElement
  | TangentLineElement
  | HistogramElement
  | NormalDistributionCurveElement
  | SlopeFieldElement
  | VectorField2dElement
  | Wireframe3dElement
  | SequencePlotElement
  | BezierCurveElement
  | ComplexPlaneElement
  | NumberTheoryGridElement
  | ConicSectionElement
  | CoordinateGridElement
  | ProbabilityTreeElement
  | ScatterPlotElement
  | SymbolGridElement
  | EquationSystemElement
  | ComparisonChartElement
  | BoxPlotElement
  | AnnotationArrowElement
  | FormulaBoxElement
  | VennDiagramElement
  | TruthTableElement
  | PolygonElement
  | GeometricConstructionElement
  | IntervalDiagramElement;

/**
 * Exhaustive-check helper for the DrawElement discriminated union.
 * Place in the `default` branch of any switch on `element.type` so
 * the compiler errors when a new variant is added to DrawElement.
 */
export function assertNeverDrawElement(x: never, fallback?: string): never {
  throw new Error(`Unhandled DrawElement type: ${(x as Record<string, unknown>)?.type ?? fallback}`);
}

export type ColorTheme = 'default' | 'dark' | 'colorful' | 'pastel' | 'monochrome';

export interface DrawBatch {
  batch_id: string;
  style_preset?: StylePreset;
  elements: DrawElement[];
  /** Origin of this batch — useful for auditing and conflict resolution. */
  source?: 'ai-stream' | 'injection' | 'template';
  /** Schema version for forward-compatible deserialization (default: 1). */
  schemaVersion?: number;
  /** Monotonic sequence number for deterministic cross-channel ordering (STATE-001). */
  sequenceNumber?: number;
  /** Color theme for math drawings — controls axis, grid, curve, and fill colors. */
  colorTheme?: ColorTheme;
}

export type SemanticTemplate =
  | 'equation_derivation_vertical'
  | 'jacobian_mapping_2panel'
  | 'freeform_semantic'
  | 'graph_diagram'
  | 'probability_tree'
  | 'tree_diagram';

export type RegionHint = 'left' | 'right' | 'center' | 'bottom' | 'auto';

export interface RelativePose {
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation_deg?: number;
}

export interface SemanticEquationLine {
  id: string;
  tex: string;
  displayMode?: boolean;
  role?: 'step' | 'result' | 'note';
}

export interface SemanticEquationStackBlock {
  id: string;
  kind: 'equation_stack';
  region_hint?: RegionHint;
  title?: string;
  lines: SemanticEquationLine[];
  align?: 'left' | 'center';
}

export interface SemanticDiagramShape {
  id: string;
  type: 'rect' | 'parallelogram' | 'line' | 'arrow' | 'diamond' | 'circle' | 'ellipse' | 'hexagon' | 'triangle';
  label?: string;
  relative_pose?: RelativePose;
}

export interface SemanticDiagramPanelBlock {
  id: string;
  kind: 'diagram_panel';
  region_hint?: Exclude<RegionHint, 'bottom'>;
  title?: string;
  axes?: { x_label: string; y_label: string };
  shapes?: SemanticDiagramShape[];
  captions?: Array<{
    id: string;
    text: string;
    anchor: 'top' | 'bottom' | 'left' | 'right' | 'center';
  }>;
}

export interface SemanticCaptionBlock {
  id: string;
  kind: 'caption';
  text: string;
  region_hint?: 'bottom' | 'center' | 'auto';
}

export interface SemanticAnnotationBlock {
  id: string;
  kind: 'annotation';
  target_block_id: string;
  text: string;
  style?: 'callout' | 'bracket' | 'underline';
  anchor?: string;
}

export type GraphNodeShape = 'circle' | 'rect' | 'square' | 'diamond' | 'double_circle';

export interface SemanticGraphNodeBlock {
  id: string;
  kind: 'node';
  label?: string;
  shape?: GraphNodeShape;
  x?: number;
  y?: number;
  color?: string;
  fillColor?: string;
}

export type GraphLayout = 'auto' | 'circular' | 'tree';

export interface SemanticGraphEdgeBlock {
  id: string;
  kind: 'edge';
  from: string;
  to: string;
  label?: string;
  weight?: number;
  directed?: boolean;
  curved?: boolean;
  color?: string;
}

export interface SemanticProbabilityTreeRootBlock {
  id: string;
  kind: 'root';
  label: string;
}

export interface SemanticProbabilityTreeBranchBlock {
  id: string;
  kind: 'branch';
  from: string;
  to: string;
  label?: string;
  probability?: number;
}

export interface TreeNodeSpec {
  label: string;
  value?: string | number;
  color?: string;
  children?: TreeNodeSpec[];
}

export interface SemanticTreeDiagramBlock {
  id: string;
  kind: 'tree_node';
  root: TreeNodeSpec;
  cx: number;
  cy: number;
  levelHeight?: number;
  nodeRadius?: number;
  strokeColor?: string;
}

export type SemanticBlock =
  | SemanticEquationStackBlock
  | SemanticDiagramPanelBlock
  | SemanticCaptionBlock
  | SemanticAnnotationBlock
  | SemanticGraphNodeBlock
  | SemanticGraphEdgeBlock
  | SemanticProbabilityTreeRootBlock
  | SemanticProbabilityTreeBranchBlock
  | SemanticTreeDiagramBlock;

export interface SemanticRelation {
  id: string;
  type: 'maps_to' | 'explains' | 'derived_from' | 'points_to';
  from_block_id: string;
  to_block_id: string;
  from_anchor?: string;
  to_anchor?: string;
  label?: string;
}

export interface SemanticBatch {
  batch_id: string;
  style_preset?: StylePreset;
  template: SemanticTemplate;
  blocks: SemanticBlock[];
  relations?: SemanticRelation[];
  intent?: 'teach' | 'derive' | 'compare' | 'summarize';
}

export interface WhiteboardBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface WhiteboardContext {
  elementCount: number;
  bounds?: WhiteboardBounds;
  elementTypeCounts: Partial<Record<DrawElement['type'], number>>;
  recentElements: Array<{
    id: string;
    type: DrawElement['type'];
    textPreview?: string;
  }>;
  suggestedNextOrigin: {
    x: number;
    y: number;
  };
}

export type MathContext = 'empty' | 'has_axes' | 'has_function' | 'has_geometry';
export type DrawingStyle = 'clean' | 'sketch' | 'formal';

export interface SpatialBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpatialSummary {
  occupied_regions: Array<{
    label: string;
    bounds: SpatialBounds;
  }>;
  free_regions: Array<{
    label: string;
    bounds: SpatialBounds;
    area: number;
  }>;
  largest_free_region: SpatialBounds | null;
}

export interface StructuredWhiteboardContext {
  scene_summary: {
    element_count: number;
    bounds?: WhiteboardBounds;
    type_counts: Partial<Record<DrawElement['type'], number>>;
    /** Count of each element type for quick AI reference. */
    element_type_summary?: Partial<Record<DrawElement['type'], number>>;
    /** High-level classification of what math content is on the board. */
    math_context?: MathContext;
    /** Suggested drawing style based on existing content consistency. */
    suggested_drawing_style?: DrawingStyle;
  };
  occupied_regions: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    semantic_kind: string;
    priority: number;
  }>;
  anchors: Array<{
    id: string;
    x: number;
    y: number;
    role: string;
  }>;
  recent_blocks: Array<{
    id: string;
    kind: string;
    region: string;
    text_preview?: string;
  }>;
  suggested_next_regions: Array<{
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    score: number;
  }>;
  /** Spatial occupancy analysis for overlap avoidance. */
  spatial_summary?: SpatialSummary;
  token_budget_hint: {
    max_chars: number;
  };
}

export interface WhiteboardLayoutDiagnostics {
  batchId: string;
  violationsFixed: string[];
  templateUsed: SemanticTemplate | 'legacy_draw_batch';
  fallbackUsed: boolean;
}

export type DrawingSpeed = 'instant' | 'fast' | 'natural' | 'slow';

export interface StrokeMeta {
  /** Source element type (e.g. 'function_curve', 'cartesian_axes', 'text'). */
  elementType?: string;
  /** True when this stroke is part of a function curve (enables easeInOut). */
  curveSegment?: boolean;
}

export interface StrokeTrajectory {
  id: string;
  elementId: string;
  points: Point[];
  color: string;
  baseWidth: number;
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  /** Hint for animation speed; inferred automatically when omitted. */
  drawingSpeed?: DrawingSpeed;
  /** Line dash style for mathematical drawings (asymptotes, gridlines). */
  lineStyle?: LineStyle;
  /** When true, skip sinusoidal width modulation for precise mathematical lines. */
  mathematical?: boolean;
  /** Fallback text rendering when LaTeX/SVG stroke extraction fails. */
  textFallback?: {
    text: string;
    x: number;
    y: number;
    fontSize: number;
  };
  /** Metadata for animation ordering, easing selection, and speed inference. */
  meta?: StrokeMeta;
}

export interface ActiveStroke extends StrokeTrajectory {
  startedAt: number;
  durationMs: number;
  length: number;
  cumulativeLengths: number[];
  speedFactors?: number[];
}

export interface TokenUsage {
  prompt?: number;
  completion?: number;
  total?: number;
}

export type AgentSSEEvent =
  | { type: 'assistant.text.delta'; turnId: string; delta: string }
  | { type: 'assistant.text.done'; turnId: string; messageId: string }
  | { type: 'whiteboard.batch'; turnId: string; batch: DrawBatch }
  | {
      type: 'whiteboard.layout.diagnostics';
      turnId: string;
      batchId: string;
      violationsFixed: string[];
      templateUsed: SemanticTemplate | 'legacy_draw_batch';
      fallbackUsed: boolean;
      semanticBatch?: SemanticBatch;
    }
  | {
      type: 'warning';
      turnId: string;
      code: string;
      message: string;
      context?: string;
    }
  | {
      type: 'error';
      turnId: string;
      code: string;
      message: string;
      retryable: boolean;
      retryAfterMs?: number;
    }
  | { type: 'turn.done'; turnId: string; usage?: TokenUsage; partial?: boolean };
