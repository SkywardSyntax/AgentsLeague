import type {
  DrawBatch,
  DrawElement,
  Point,
  SemanticBatch,
  SemanticTemplate,
  StylePreset,
} from '@/types/agent';

export interface PlannerRegion {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

export interface PlannerAnchor {
  id: string;
  point: Point;
  role: string;
}

export interface PlannedSemanticLayout {
  batchId: string;
  stylePreset: StylePreset;
  templateUsed: SemanticTemplate;
  elements: DrawElement[];
  anchors: PlannerAnchor[];
  semanticBatch: SemanticBatch;
  warnings: string[];
}

export interface PlannerConstraintResult {
  batch: DrawBatch;
  violationsFixed: string[];
  fallbackUsed: boolean;
}

export interface PlannerConfig {
  canvasWidth: number;
  canvasHeight: number;
  margin: number;
  maxRepairIterations: number;
  minTextGap: number;
  minLabelGap: number;
  maxScaleDownPerBlock: number;
}

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  canvasWidth: 1600,
  canvasHeight: 1200,
  margin: 24,
  maxRepairIterations: 6,
  minTextGap: 14,
  minLabelGap: 10,
  maxScaleDownPerBlock: 0.15,
};
