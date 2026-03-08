/**
 * Client-side payload validator for DrawBatch JSON.
 *
 * Runs before the server-side Zod schema to give users fast, helpful
 * inline feedback with suggestions.
 */

import { DRAW_ELEMENT_TYPES } from '@/lib/schema';

// ── Public types ──────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// ── Known types list ──────────────────────────────────────────────────

const KNOWN_TYPES: readonly string[] = DRAW_ELEMENT_TYPES;

// ── Required fields per element type ──────────────────────────────────

interface FieldSpec {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

const REQUIRED_FIELDS: Record<string, FieldSpec[]> = {
  rect:                  [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'w', type: 'number' }, { name: 'h', type: 'number' }],
  ellipse:               [{ name: 'cx', type: 'number' }, { name: 'cy', type: 'number' }, { name: 'rx', type: 'number' }, { name: 'ry', type: 'number' }],
  line:                  [{ name: 'from', type: 'object' }, { name: 'to', type: 'object' }],
  arrow:                 [{ name: 'from', type: 'object' }, { name: 'to', type: 'object' }],
  text:                  [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'text', type: 'string' }],
  latex:                 [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'tex', type: 'string' }],
  clear:                 [],
  cartesian_axes:        [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'xRange', type: 'array' }, { name: 'yRange', type: 'array' }],
  number_line:           [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'length', type: 'number' }, { name: 'min', type: 'number' }, { name: 'max', type: 'number' }],
  vector_arrow:          [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'dx', type: 'number' }, { name: 'dy', type: 'number' }],
  function_curve:        [{ name: 'expression', type: 'string' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'xRange', type: 'array' }, { name: 'yRange', type: 'array' }],
  matrix_bracket:        [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'rows', type: 'array' }, { name: 'bracketStyle', type: 'string' }],
  linear_transform:      [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'matrix', type: 'array' }],
  angle_arc:             [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'radius', type: 'number' }, { name: 'startAngle', type: 'number' }, { name: 'endAngle', type: 'number' }],
  integral_region:       [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'xRange', type: 'array' }, { name: 'yRange', type: 'array' }, { name: 'topPoints', type: 'array' }],
  circle_with_radius:    [{ name: 'cx', type: 'number' }, { name: 'cy', type: 'number' }, { name: 'r', type: 'number' }],
  triangle_with_angles:  [{ name: 'vertices', type: 'array' }],
  parametric_curve:      [{ name: 'xExpression', type: 'string' }, { name: 'yExpression', type: 'string' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'tRange', type: 'array' }, { name: 'xRange', type: 'array' }, { name: 'yRange', type: 'array' }],
  polar_plot:            [{ name: 'expression', type: 'string' }, { name: 'cx', type: 'number' }, { name: 'cy', type: 'number' }, { name: 'radius', type: 'number' }],
  riemann_sum:           [{ name: 'expression', type: 'string' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'xRange', type: 'array' }, { name: 'yRange', type: 'array' }, { name: 'n', type: 'number' }],
  tangent_line:          [{ name: 'expression', type: 'string' }, { name: 'atX', type: 'number' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'xRange', type: 'array' }, { name: 'yRange', type: 'array' }],
  histogram:             [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'bins', type: 'array' }],
  normal_distribution:   [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'mean', type: 'number' }, { name: 'stddev', type: 'number' }],
  slope_field:           [{ name: 'expression', type: 'string' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'xRange', type: 'array' }, { name: 'yRange', type: 'array' }],
  vector_field_2d:       [{ name: 'dxExpression', type: 'string' }, { name: 'dyExpression', type: 'string' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }, { name: 'xRange', type: 'array' }, { name: 'yRange', type: 'array' }],
  wireframe_3d:          [{ name: 'cx', type: 'number' }, { name: 'cy', type: 'number' }, { name: 'size', type: 'number' }, { name: 'shape', type: 'string' }],
  sequence_plot:         [{ name: 'expression', type: 'string' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }],
  bezier_curve:          [{ name: 'points', type: 'array' }],
  complex_plane:         [{ name: 'cx', type: 'number' }, { name: 'cy', type: 'number' }, { name: 'radius', type: 'number' }],
  number_theory_grid:    [{ name: 'n', type: 'number' }, { name: 'highlights', type: 'array' }, { name: 'cx', type: 'number' }, { name: 'cy', type: 'number' }],
  annotation_arrow:      [{ name: 'text', type: 'string' }, { name: 'targetX', type: 'number' }, { name: 'targetY', type: 'number' }, { name: 'labelX', type: 'number' }, { name: 'labelY', type: 'number' }],
  formula_box:           [{ name: 'formula', type: 'string' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }],
};

// ── Canvas bounds for warnings ────────────────────────────────────────

const CANVAS_MIN = -100;
const CANVAS_MAX = 1500;

// Coordinate field names to check for off-canvas warnings
const COORD_X_FIELDS = ['x', 'cx', 'targetX', 'labelX'];
const COORD_Y_FIELDS = ['y', 'cy', 'targetY', 'labelY'];

// ── Fuzzy suggestion helper ───────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function suggestTypes(unknown: string, limit = 3): string[] {
  return [...KNOWN_TYPES]
    .map((t) => ({ t, d: levenshtein(unknown, t) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .filter((x) => x.d <= Math.max(unknown.length, 5))
    .map((x) => x.t);
}

// ── Core validation ───────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function matchesType(value: unknown, expected: FieldSpec['type']): boolean {
  switch (expected) {
    case 'string':  return typeof value === 'string';
    case 'number':  return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'array':   return Array.isArray(value);
    case 'object':  return isRecord(value);
  }
}

function validateElement(el: unknown, index: number, errors: ValidationError[], warnings: ValidationWarning[]): void {
  const prefix = `elements[${index}]`;

  if (!isRecord(el)) {
    errors.push({ path: prefix, message: 'Element must be an object' });
    return;
  }

  // id check
  if (typeof el.id !== 'string' || el.id.length === 0) {
    errors.push({ path: `${prefix}.id`, message: "Missing required field 'id' (string)" });
  }

  // type check
  if (typeof el.type !== 'string') {
    errors.push({ path: `${prefix}.type`, message: "Missing required field 'type' (string)" });
    return;
  }

  const elType = el.type;
  if (!(KNOWN_TYPES as readonly string[]).includes(elType)) {
    const suggestions = suggestTypes(elType);
    const suggestion = suggestions.length > 0 ? `Did you mean: ${suggestions.join(', ')}?` : undefined;
    errors.push({
      path: `${prefix}.type`,
      message: `Unknown element type '${elType}'.${suggestion ? ` ${suggestion}` : ''}`,
      suggestion,
    });
    return; // Can't validate fields for an unknown type
  }

  // Required fields
  const requiredFields = REQUIRED_FIELDS[elType];
  if (requiredFields) {
    for (const field of requiredFields) {
      const val = el[field.name];
      if (val === undefined || val === null) {
        errors.push({
          path: `${prefix}.${field.name}`,
          message: `${elType} requires field '${field.name}' (${field.type})`,
        });
      } else if (!matchesType(val, field.type)) {
        errors.push({
          path: `${prefix}.${field.name}`,
          message: `${elType} field '${field.name}' must be ${field.type}, got ${Array.isArray(val) ? 'array' : typeof val}`,
        });
      }
    }
  }

  // Range validation: number_theory_grid n > 20
  if (elType === 'number_theory_grid' && typeof el.n === 'number' && el.n > 20) {
    warnings.push({
      path: `${prefix}.n`,
      message: `n=${el.n} may be slow; consider n≤20`,
    });
  }

  // Canvas bounds warnings
  for (const f of COORD_X_FIELDS) {
    const val = el[f];
    if (typeof val === 'number' && (val < CANVAS_MIN || val > CANVAS_MAX)) {
      warnings.push({
        path: `${prefix}.${f}`,
        message: `Element may be off-canvas (${f}=${val})`,
      });
    }
  }
  for (const f of COORD_Y_FIELDS) {
    const val = el[f];
    if (typeof val === 'number' && (val < CANVAS_MIN || val > CANVAS_MAX)) {
      warnings.push({
        path: `${prefix}.${f}`,
        message: `Element may be off-canvas (${f}=${val})`,
      });
    }
  }
}

export function validateDrawBatchPayload(json: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!isRecord(json)) {
    errors.push({ path: '', message: 'Payload must be a JSON object' });
    return { valid: false, errors, warnings };
  }

  // batch_id
  if (typeof json.batch_id !== 'string' || json.batch_id.length === 0) {
    errors.push({ path: 'batch_id', message: "Missing required field 'batch_id' (non-empty string)" });
  }

  // elements
  if (!Array.isArray(json.elements)) {
    errors.push({ path: 'elements', message: "Missing required field 'elements' (array)" });
    return { valid: errors.length === 0, errors, warnings };
  }

  if (json.elements.length === 0) {
    errors.push({ path: 'elements', message: 'Elements array must not be empty' });
  }

  if (json.elements.length > 200) {
    errors.push({ path: 'elements', message: `Too many elements (${json.elements.length}); maximum is 200` });
  }

  for (let i = 0; i < json.elements.length; i++) {
    validateElement(json.elements[i], i, errors, warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}
