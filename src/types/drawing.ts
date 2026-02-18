/**
 * Drawing types for the AI Whiteboard.
 *
 * This module contains two layers:
 * - Legacy DrawElement types (used by existing canvas/hooks/stores)
 * - Branded DrawingShape types (new type-safe system from TYPE_SYSTEM_ARCHITECTURE)
 */

import type {
  Color,
  Dimensions,
  Font,
  Position,
  PositivePx,
  ShapeId,
  UnitFloat,
} from './primitives';

// ═══════════════════════════════════════════════════════════
// Legacy types (preserved for existing code)
// ═══════════════════════════════════════════════════════════

// ─── Geometry ─────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Style ────────────────────────────────────────────────

export type HexColor = `#${string}`;

export interface FillStyle {
  type: 'solid' | 'none';
  color: HexColor;
  opacity: number;
}

export interface StrokeStyle {
  color: HexColor;
  width: number;
  dashArray?: number[];
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
  lineHeight: number;
  letterSpacing: number;
  color: HexColor;
  align: 'left' | 'center' | 'right';
}

// ─── Elements ─────────────────────────────────────────────

export interface BaseElement {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  groupId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RectElement extends BaseElement {
  type: 'rect';
  w: number;
  h: number;
  cornerRadius: number;
  fill: FillStyle;
  stroke: StrokeStyle;
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse';
  rx: number;
  ry: number;
  fill: FillStyle;
  stroke: StrokeStyle;
}

export interface LineElement extends BaseElement {
  type: 'line';
  points: Point[];
  stroke: StrokeStyle;
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  points: Point[];
  stroke: StrokeStyle;
  startArrowhead: 'none' | 'arrow' | 'dot';
  endArrowhead: 'none' | 'arrow' | 'dot';
  startBindingId?: string;
  endBindingId?: string;
}

export interface FreehandElement extends BaseElement {
  type: 'freehand';
  points: Point[];
  pressures?: number[];
  stroke: StrokeStyle;
}

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  w: number;
  h: number;
  style: TextStyle;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  w: number;
  h: number;
  naturalWidth: number;
  naturalHeight: number;
}

export type DrawElement =
  | RectElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | FreehandElement
  | TextElement
  | ImageElement;

// ─── Scene / State ────────────────────────────────────────

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Scene {
  elements: Map<string, DrawElement>;
  selectedIds: Set<string>;
  camera: Camera;
}

// ─── AI Protocol ──────────────────────────────────────────

export type DrawOp =
  | { op: 'add'; element: DrawElement }
  | { op: 'update'; id: string; patch: Partial<DrawElement> }
  | { op: 'delete'; id: string }
  | { op: 'clear' };

export interface AIDrawResponse {
  requestId: string;
  ops: DrawOp[];
}

// ─── History (Undo/Redo) ─────────────────────────────────

export interface HistoryEntry {
  timestamp: number;
  ops: DrawOp[];
  inverseOps: DrawOp[];
}

export interface HistoryStack {
  entries: HistoryEntry[];
  pointer: number;
}

// ─── Tool State ──────────────────────────────────────────

export type ToolType =
  | 'select'
  | 'hand'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'freehand'
  | 'text'
  | 'eraser';

// ═══════════════════════════════════════════════════════════
// Branded DrawingShape types (discriminated on `kind`)
// ═══════════════════════════════════════════════════════════

/** Base interface for all branded shapes. */
export interface ShapeBase {
  readonly id: ShapeId;
  readonly position: Position;
  readonly rotation: number;
  readonly opacity: UnitFloat;
  readonly fill: Color;
  readonly stroke: Color;
  readonly strokeWidth: PositivePx;
}

export interface RectangleShape extends ShapeBase {
  readonly kind: 'rectangle';
  readonly dimensions: Dimensions;
  readonly borderRadius: PositivePx;
}

export interface EllipseShape extends ShapeBase {
  readonly kind: 'ellipse';
  readonly radiusX: PositivePx;
  readonly radiusY: PositivePx;
}

export interface LineShape extends Omit<ShapeBase, 'fill'> {
  readonly kind: 'line';
  readonly start: Position;
  readonly end: Position;
}

export interface ArrowShape extends Omit<ShapeBase, 'fill'> {
  readonly kind: 'arrow';
  readonly start: Position;
  readonly end: Position;
  readonly startArrowhead: 'none' | 'arrow' | 'dot';
  readonly endArrowhead: 'none' | 'arrow' | 'dot';
}

export interface FreehandShape extends Omit<ShapeBase, 'fill'> {
  readonly kind: 'freehand';
  readonly points: readonly Position[];
  readonly pressures?: readonly number[];
}

export interface TextShape extends ShapeBase {
  readonly kind: 'text';
  readonly content: string;
  readonly font: Font;
  readonly maxWidth: PositivePx | null;
  readonly align: 'left' | 'center' | 'right';
}

export interface ImageShape extends ShapeBase {
  readonly kind: 'image';
  readonly src: string;
  readonly dimensions: Dimensions;
  readonly alt: string;
}

/** Discriminated union of all branded shape types. */
export type DrawingShape =
  | RectangleShape
  | EllipseShape
  | LineShape
  | ArrowShape
  | FreehandShape
  | TextShape
  | ImageShape;

/** Map from kind literal → concrete shape type. */
export type ShapeMap = {
  [S in DrawingShape as S['kind']]: S;
};

/** All valid shape kind strings. */
export type ShapeKind = DrawingShape['kind'];

export const SHAPE_KINDS: readonly ShapeKind[] = [
  'rectangle',
  'ellipse',
  'line',
  'arrow',
  'freehand',
  'text',
  'image',
] as const;
