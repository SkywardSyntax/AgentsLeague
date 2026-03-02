export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export type StylePreset = 'clean_pen_sketch' | 'rough_sketch' | 'blueprint_neat';
export type PlannerMode = 'semantic_preferred' | 'legacy_draw_only';

export interface Point {
  x: number;
  y: number;
}

interface BaseDrawElement {
  id: string;
  color?: string;
  stroke_width?: number;
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
}

export interface TextElement extends BaseDrawElement {
  type: 'text';
  x: number;
  y: number;
  text: string;
  size?: number;
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

export type DrawElement =
  | RectElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | TextElement
  | LatexElement
  | ClearElement;

export interface DrawBatch {
  batch_id: string;
  style_preset?: StylePreset;
  elements: DrawElement[];
}

export type SemanticTemplate =
  | 'equation_derivation_vertical'
  | 'jacobian_mapping_2panel'
  | 'freeform_semantic';

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
  type: 'rect' | 'parallelogram' | 'line' | 'arrow';
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

export type SemanticBlock =
  | SemanticEquationStackBlock
  | SemanticDiagramPanelBlock
  | SemanticCaptionBlock
  | SemanticAnnotationBlock;

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

export interface StructuredWhiteboardContext {
  scene_summary: {
    element_count: number;
    bounds?: WhiteboardBounds;
    type_counts: Partial<Record<DrawElement['type'], number>>;
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

export interface StrokeTrajectory {
  id: string;
  elementId: string;
  points: Point[];
  color: string;
  baseWidth: number;
}

export interface ActiveStroke extends StrokeTrajectory {
  startedAt: number;
  durationMs: number;
  length: number;
  cumulativeLengths: number[];
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
    }
  | { type: 'turn.done'; turnId: string; usage?: TokenUsage };
