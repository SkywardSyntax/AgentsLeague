'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ClipboardEvent as ReactClipboardEvent } from 'react';
import { DrawBatchSchema } from '@/lib/schema';
import { useDrawInjector } from '@/hooks/useDrawInjector';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { DrawBatch, DrawElement } from '@/types/agent';
import { PillButton } from '@/components/ui/PillButton';
import { MiniPreviewCanvas } from './MiniPreviewCanvas';
import { DrawingPayloadDocs } from './DrawingPayloadDocs';

// ---------------------------------------------------------------------------
// Template categories & types
// ---------------------------------------------------------------------------

const TEMPLATE_CATEGORIES = ['All', 'Basic', 'Algebra', 'Calculus', 'Geometry', 'Linear Algebra', 'Statistics', 'Examples'] as const;
type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

interface MathTemplate {
  label: string;
  category: Exclude<TemplateCategory, 'All'>;
  description: string;
  build: () => DrawBatch;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(prefix: string, i?: number): string {
  return i !== undefined ? `${prefix}-${i}` : `${prefix}-${Date.now().toString(36)}`;
}

function batchId(slug: string): string {
  return `tpl-${slug}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Template payloads — 10 math-focused presets
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, MathTemplate> = {
  /* 1 ── Cartesian Axes (-5,5)×(-5,5) with gridlines */
  cartesian_axes: {
    label: 'Cartesian Axes',
    category: 'Basic',
    description: '(-5,5)×(-5,5) axes with gridlines',
    build: () => {
      const elements: DrawElement[] = [
        {
          id: uid('ca-axes'),
          type: 'cartesian_axes',
          x: 100,
          y: 60,
          width: 800,
          height: 600,
          xRange: [-5, 5],
          yRange: [-5, 5],
          xLabel: 'x',
          yLabel: 'y',
          gridlines: true,
        },
      ];
      const ox = 500, oy = 360, scale = 80;
      for (let v = -5; v <= 5; v++) {
        if (v === 0) continue;
        elements.push({ id: uid('ca-xt', v + 5), type: 'text', x: ox + v * scale - 4, y: oy + 18, text: String(v), size: 11 });
      }
      for (let v = -5; v <= 5; v++) {
        if (v === 0) continue;
        elements.push({ id: uid('ca-yt', v + 5), type: 'text', x: ox - 22, y: oy - v * scale + 4, text: String(v), size: 11 });
      }
      elements.push({ id: uid('ca-o'), type: 'text', x: ox - 14, y: oy + 16, text: 'O', size: 12 });
      return { batch_id: batchId('axes'), style_preset: 'clean_pen_sketch' as const, elements };
    },
  },

  /* 2 ── Number Line -5 to 5 */
  number_line: {
    label: 'Number Line',
    category: 'Basic',
    description: 'Horizontal number line from −5 to 5',
    build: () => ({
      batch_id: batchId('numline'),
      style_preset: 'clean_pen_sketch' as const,
      elements: [
        { id: uid('nl'), type: 'number_line' as const, x: 100, y: 350, length: 800, min: -5, max: 5, label: 'ℝ' },
      ],
    }),
  },

  /* 3 ── Sine Wave (pre-sampled) */
  sine_wave: {
    label: 'Sine Wave',
    category: 'Calculus',
    description: 'sin(x) curve from −2π to 2π',
    build: () => {
      const elements: DrawElement[] = [];
      const ox = 500, oy = 350, xScale = 60, yScale = 120;
      elements.push(
        { id: uid('sw-xa'), type: 'arrow', from: { x: ox - 400, y: oy }, to: { x: ox + 400, y: oy }, color: '#111827', stroke_width: 1 },
        { id: uid('sw-ya'), type: 'arrow', from: { x: ox, y: oy + 180 }, to: { x: ox, y: oy - 180 }, color: '#111827', stroke_width: 1 },
      );
      const N = 80;
      const xMin = -2 * Math.PI, xMax = 2 * Math.PI;
      for (let i = 0; i < N; i++) {
        const t0 = xMin + (i / N) * (xMax - xMin);
        const t1 = xMin + ((i + 1) / N) * (xMax - xMin);
        elements.push({
          id: uid('sw-seg', i),
          type: 'line',
          from: { x: Math.round(ox + t0 * xScale), y: Math.round(oy - Math.sin(t0) * yScale) },
          to: { x: Math.round(ox + t1 * xScale), y: Math.round(oy - Math.sin(t1) * yScale) },
          color: '#0a84ff',
          stroke_width: 2,
        });
      }
      elements.push(
        { id: uid('sw-lbl'), type: 'latex', x: ox + 300, y: oy - 170, tex: 'y = \\sin(x)', fontSize: 18, displayMode: false },
        { id: uid('sw-pi'), type: 'text', x: ox + Math.round(Math.PI * xScale) - 4, y: oy + 16, text: 'π', size: 13 },
        { id: uid('sw-npi'), type: 'text', x: ox - Math.round(Math.PI * xScale) - 8, y: oy + 16, text: '−π', size: 13 },
      );
      return { batch_id: batchId('sine'), style_preset: 'clean_pen_sketch' as const, elements };
    },
  },

  /* 4 ── Unit Circle with angle marks & coordinate labels */
  unit_circle: {
    label: 'Unit Circle',
    category: 'Geometry',
    description: 'Circle with 0°/90°/180°/270° labels',
    build: () => {
      const cx = 500, cy = 400, r = 200;
      const angles = [
        { deg: 0, coord: '(1, 0)' },
        { deg: 90, coord: '(0, 1)' },
        { deg: 180, coord: '(−1, 0)' },
        { deg: 270, coord: '(0, −1)' },
      ];
      const elements: DrawElement[] = [
        { id: uid('uc-c'), type: 'ellipse', cx, cy, rx: r, ry: r, color: '#0a84ff', stroke_width: 2 },
        { id: uid('uc-xa'), type: 'arrow', from: { x: cx - r - 50, y: cy }, to: { x: cx + r + 50, y: cy }, color: '#111827', stroke_width: 1 },
        { id: uid('uc-ya'), type: 'arrow', from: { x: cx, y: cy + r + 50 }, to: { x: cx, y: cy - r - 50 }, color: '#111827', stroke_width: 1 },
      ];
      for (const { deg, coord } of angles) {
        const rad = (deg * Math.PI) / 180;
        const px = Math.round(cx + r * Math.cos(rad));
        const py = Math.round(cy - r * Math.sin(rad));
        const tickLen = 8;
        elements.push({
          id: uid(`uc-tick-${deg}`),
          type: 'line',
          from: { x: Math.round(cx + (r - tickLen) * Math.cos(rad)), y: Math.round(cy - (r - tickLen) * Math.sin(rad)) },
          to: { x: Math.round(cx + (r + tickLen) * Math.cos(rad)), y: Math.round(cy - (r + tickLen) * Math.sin(rad)) },
          color: '#111827',
          stroke_width: 2,
        });
        const lOff = 28;
        elements.push({
          id: uid(`uc-deg-${deg}`),
          type: 'text',
          x: Math.round(px + lOff * Math.cos(rad)) - 8,
          y: Math.round(py - lOff * Math.sin(rad)),
          text: `${deg}°`,
          size: 12,
          color: '#64748b',
        });
        elements.push({
          id: uid(`uc-coord-${deg}`),
          type: 'text',
          x: Math.round(px + 40 * Math.cos(rad)) - 12,
          y: Math.round(py - 40 * Math.sin(rad)) + 14,
          text: coord,
          size: 11,
          color: '#111827',
        });
      }
      const r30 = (30 * Math.PI) / 180;
      elements.push(
        { id: uid('uc-rad'), type: 'line', from: { x: cx, y: cy }, to: { x: Math.round(cx + r * Math.cos(r30)), y: Math.round(cy - r * Math.sin(r30)) }, color: '#c61f1f', stroke_width: 2 },
        { id: uid('uc-lbl30'), type: 'text', x: Math.round(cx + r * Math.cos(r30)) + 8, y: Math.round(cy - r * Math.sin(r30)) - 8, text: '(cos θ, sin θ)', size: 12 },
        { id: uid('uc-theta'), type: 'latex', x: cx + 40, y: cy - 14, tex: '\\theta', fontSize: 14, displayMode: false },
      );
      return { batch_id: batchId('unitcircle'), style_preset: 'clean_pen_sketch' as const, elements };
    },
  },

  /* 5 ── Equilateral Triangle with angle arcs & side labels */
  triangle: {
    label: 'Triangle',
    category: 'Geometry',
    description: 'Equilateral triangle with 60° arcs',
    build: () => {
      const h = 260 * Math.sqrt(3) / 2;
      const A = { x: 500, y: 180 };
      const B = { x: 370, y: Math.round(180 + h) };
      const C = { x: 630, y: Math.round(180 + h) };
      const elements: DrawElement[] = [
        { id: uid('tri-ab'), type: 'line', from: A, to: B, color: '#111827', stroke_width: 2 },
        { id: uid('tri-bc'), type: 'line', from: B, to: C, color: '#111827', stroke_width: 2 },
        { id: uid('tri-ca'), type: 'line', from: C, to: A, color: '#111827', stroke_width: 2 },
        { id: uid('tri-lab'), type: 'text', x: 410, y: Math.round((A.y + B.y) / 2 - 10), text: 'a', size: 16, color: '#0a84ff' },
        { id: uid('tri-lbc'), type: 'text', x: 490, y: B.y + 22, text: 'a', size: 16, color: '#0a84ff' },
        { id: uid('tri-lca'), type: 'text', x: 575, y: Math.round((A.y + C.y) / 2 - 10), text: 'a', size: 16, color: '#0a84ff' },
        { id: uid('tri-angA'), type: 'latex', x: A.x - 4, y: A.y + 26, tex: '60°', fontSize: 12, displayMode: false },
        { id: uid('tri-angB'), type: 'latex', x: B.x + 14, y: B.y - 28, tex: '60°', fontSize: 12, displayMode: false },
        { id: uid('tri-angC'), type: 'latex', x: C.x - 38, y: C.y - 28, tex: '60°', fontSize: 12, displayMode: false },
      ];
      // Small arc indicators at each vertex
      const arcVertices = [
        { center: A, startAng: (4 * Math.PI) / 6 },
        { center: B, startAng: -Math.PI / 6 },
        { center: C, startAng: (7 * Math.PI) / 6 },
      ];
      const arcR = 24, segs = 8, sweep = Math.PI / 3;
      for (let idx = 0; idx < arcVertices.length; idx++) {
        const { center, startAng } = arcVertices[idx];
        for (let s = 0; s < segs; s++) {
          const a0 = startAng + (s / segs) * sweep;
          const a1 = startAng + ((s + 1) / segs) * sweep;
          elements.push({
            id: uid(`tri-arc${idx}`, s),
            type: 'line',
            from: { x: Math.round(center.x + arcR * Math.cos(a0)), y: Math.round(center.y + arcR * Math.sin(a0)) },
            to: { x: Math.round(center.x + arcR * Math.cos(a1)), y: Math.round(center.y + arcR * Math.sin(a1)) },
            color: '#c61f1f',
            stroke_width: 1,
          });
        }
      }
      return { batch_id: batchId('triangle'), style_preset: 'clean_pen_sketch' as const, elements };
    },
  },

  /* 6 ── Vector Diagram (vector addition with VectorArrowElement) */
  vector_diagram: {
    label: 'Vector Diagram',
    category: 'Linear Algebra',
    description: '3 vectors showing A⃗ + B⃗ = R⃗',
    build: () => ({
      batch_id: batchId('vectors'),
      style_preset: 'clean_pen_sketch' as const,
      elements: [
        { id: uid('va'), type: 'vector_arrow' as const, x: 200, y: 500, dx: 300, dy: -200, label: 'A⃗', color: '#0a84ff' },
        { id: uid('vb'), type: 'vector_arrow' as const, x: 500, y: 300, dx: 200, dy: 200, label: 'B⃗', color: '#22c55e' },
        { id: uid('vr'), type: 'vector_arrow' as const, x: 200, y: 500, dx: 500, dy: 0, label: 'A⃗ + B⃗', color: '#c61f1f' },
        { id: uid('v-eq'), type: 'latex', x: 280, y: 560, tex: '\\vec{R} = \\vec{A} + \\vec{B}', fontSize: 16, displayMode: false },
      ],
    }),
  },

  /* 7 ── Fraction / Ratio equation box */
  fraction_ratio: {
    label: 'Fraction / Ratio',
    category: 'Algebra',
    description: 'Equation box with \\frac{a}{b}',
    build: () => ({
      batch_id: batchId('fraction'),
      style_preset: 'clean_pen_sketch' as const,
      elements: [
        { id: uid('fr-box'), type: 'rect', x: 200, y: 220, w: 600, h: 260, color: '#0a84ff', stroke_width: 2 },
        { id: uid('fr-title'), type: 'text', x: 220, y: 240, text: 'Fraction / Ratio', size: 14, color: '#64748b' },
        { id: uid('fr-main'), type: 'latex', x: 380, y: 300, tex: '\\frac{a}{b} = \\frac{c}{d}', displayMode: true, fontSize: 32 },
        { id: uid('fr-note'), type: 'latex', x: 310, y: 420, tex: 'a \\cdot d = b \\cdot c \\quad \\text{(cross multiply)}', displayMode: false, fontSize: 16 },
      ],
    }),
  },

  /* 8 ── 2×2 Matrix */
  matrix_2x2: {
    label: 'Matrix 2×2',
    category: 'Linear Algebra',
    description: '2×2 matrix with determinant & inverse',
    build: () => ({
      batch_id: batchId('matrix'),
      style_preset: 'clean_pen_sketch' as const,
      elements: [
        { id: uid('mx-box'), type: 'rect', x: 200, y: 200, w: 600, h: 300, color: '#64748b', stroke_width: 1 },
        { id: uid('mx-title'), type: 'text', x: 220, y: 225, text: '2×2 Matrix', size: 14, color: '#64748b' },
        { id: uid('mx-def'), type: 'latex', x: 290, y: 270, tex: 'A = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', displayMode: true, fontSize: 28 },
        { id: uid('mx-det'), type: 'latex', x: 270, y: 380, tex: '\\det(A) = ad - bc', displayMode: true, fontSize: 22 },
        { id: uid('mx-inv'), type: 'latex', x: 230, y: 440, tex: 'A^{-1} = \\frac{1}{ad-bc}\\begin{bmatrix} d & -b \\\\ -c & a \\end{bmatrix}', displayMode: true, fontSize: 18 },
      ],
    }),
  },

  /* 9 ── Derivative Illustration (curve + tangent + slope) */
  derivative: {
    label: 'Derivative Illustration',
    category: 'Calculus',
    description: 'f(x) curve with tangent line & slope',
    build: () => {
      const elements: DrawElement[] = [];
      const ox = 160, oy = 500, xScale = 90, yScale = 50;
      elements.push(
        { id: uid('dv-xa'), type: 'arrow', from: { x: ox - 20, y: oy }, to: { x: ox + 650, y: oy }, color: '#111827', stroke_width: 1 },
        { id: uid('dv-ya'), type: 'arrow', from: { x: ox, y: oy + 20 }, to: { x: ox, y: oy - 350 }, color: '#111827', stroke_width: 1 },
        { id: uid('dv-xl'), type: 'text', x: ox + 660, y: oy + 4, text: 'x', size: 14 },
        { id: uid('dv-yl'), type: 'text', x: ox + 8, y: oy - 355, text: 'y', size: 14 },
      );
      const N = 50;
      for (let i = 0; i < N; i++) {
        const t0 = (i / N) * 6;
        const t1 = ((i + 1) / N) * 6;
        elements.push({
          id: uid('dv-c', i),
          type: 'line',
          from: { x: Math.round(ox + t0 * xScale), y: Math.round(oy - t0 * t0 * yScale) },
          to: { x: Math.round(ox + t1 * xScale), y: Math.round(oy - t1 * t1 * yScale) },
          color: '#0a84ff',
          stroke_width: 2,
        });
      }
      const xT = 2, slope = 4, yT = xT * xT, tanLen = 1.8;
      elements.push(
        {
          id: uid('dv-tan'),
          type: 'line',
          from: { x: Math.round(ox + (xT - tanLen) * xScale), y: Math.round(oy - (yT - slope * tanLen) * yScale) },
          to: { x: Math.round(ox + (xT + tanLen) * xScale), y: Math.round(oy - (yT + slope * tanLen) * yScale) },
          color: '#c61f1f',
          stroke_width: 2,
        },
        { id: uid('dv-dot'), type: 'ellipse', cx: Math.round(ox + xT * xScale), cy: Math.round(oy - yT * yScale), rx: 5, ry: 5, color: '#c61f1f', stroke_width: 2 },
        { id: uid('dv-flbl'), type: 'latex', x: ox + 500, y: oy - 320, tex: 'f(x) = x^2', fontSize: 16, displayMode: false },
        { id: uid('dv-slbl'), type: 'latex', x: Math.round(ox + (xT + tanLen) * xScale) + 10, y: Math.round(oy - (yT + slope * tanLen) * yScale) - 10, tex: "f'(2) = 4", fontSize: 14, displayMode: false },
        { id: uid('dv-note'), type: 'text', x: Math.round(ox + xT * xScale) - 30, y: Math.round(oy - yT * yScale) - 18, text: '(2, 4)', size: 12, color: '#64748b' },
      );
      return { batch_id: batchId('derivative'), style_preset: 'clean_pen_sketch' as const, elements };
    },
  },

  /* 10 ── Integral Region (shaded area under curve) */
  integral_region: {
    label: 'Integral Region',
    category: 'Calculus',
    description: 'Shaded area under a curve ∫₁⁴ f(x)dx',
    build: () => {
      const elements: DrawElement[] = [];
      const ox = 140, oy = 520, xScale = 100, yScale = 12;
      const f = (x: number) => x * x;
      elements.push(
        { id: uid('ig-xa'), type: 'arrow', from: { x: ox - 20, y: oy }, to: { x: ox + 600, y: oy }, color: '#111827', stroke_width: 1 },
        { id: uid('ig-ya'), type: 'arrow', from: { x: ox, y: oy + 20 }, to: { x: ox, y: oy - 400 }, color: '#111827', stroke_width: 1 },
      );
      const N = 50;
      for (let i = 0; i < N; i++) {
        const t0 = (i / N) * 5;
        const t1 = ((i + 1) / N) * 5;
        elements.push({
          id: uid('ig-c', i),
          type: 'line',
          from: { x: Math.round(ox + t0 * xScale), y: Math.round(oy - f(t0) * yScale) },
          to: { x: Math.round(ox + t1 * xScale), y: Math.round(oy - f(t1) * yScale) },
          color: '#0a84ff',
          stroke_width: 2,
        });
      }
      const strips = 30, a = 1, b = 4;
      for (let i = 0; i < strips; i++) {
        const xi = a + (i / strips) * (b - a);
        const px = Math.round(ox + xi * xScale);
        elements.push({
          id: uid('ig-sh', i),
          type: 'line',
          from: { x: px, y: oy },
          to: { x: px, y: Math.round(oy - f(xi) * yScale) },
          color: '#0a84ff',
          stroke_width: 1,
        });
      }
      elements.push(
        { id: uid('ig-ba'), type: 'line', from: { x: Math.round(ox + a * xScale), y: oy }, to: { x: Math.round(ox + a * xScale), y: Math.round(oy - f(a) * yScale) }, color: '#111827', stroke_width: 1 },
        { id: uid('ig-bb'), type: 'line', from: { x: Math.round(ox + b * xScale), y: oy }, to: { x: Math.round(ox + b * xScale), y: Math.round(oy - f(b) * yScale) }, color: '#111827', stroke_width: 1 },
        { id: uid('ig-la'), type: 'text', x: Math.round(ox + a * xScale) - 4, y: oy + 16, text: '1', size: 13 },
        { id: uid('ig-lb'), type: 'text', x: Math.round(ox + b * xScale) - 4, y: oy + 16, text: '4', size: 13 },
        { id: uid('ig-eq'), type: 'latex', x: ox + 420, y: oy - 350, tex: '\\int_{1}^{4} x^2 \\, dx = 21', displayMode: true, fontSize: 22 },
        { id: uid('ig-fl'), type: 'latex', x: ox + 420, y: oy - 280, tex: 'f(x) = x^2', fontSize: 16, displayMode: false },
      );
      return { batch_id: batchId('integral'), style_preset: 'clean_pen_sketch' as const, elements };
    },
  },

  /* ── Example Payloads ─── */

  /* 11 ── Full Math Suite (cartesian_axes + function_curve + number_line + text + latex) */
  full_math_suite: {
    label: 'Full Math Suite',
    category: 'Examples',
    description: 'Axes, function curve, number line, text & LaTeX',
    build: () => {
      const elements: DrawElement[] = [
        {
          id: uid('fms-axes'), type: 'cartesian_axes',
          x: 80, y: 50, width: 600, height: 400,
          xRange: [-5, 5], yRange: [-2, 10],
          xLabel: 'x', yLabel: 'y', gridlines: true,
        },
        {
          id: uid('fms-curve'), type: 'function_curve',
          x: 80, y: 50, width: 600, height: 400,
          xRange: [-5, 5], yRange: [-2, 10],
          expression: 'x*x', label: 'f(x) = x²', color: '#2563eb',
        },
        {
          id: uid('fms-nl'), type: 'number_line',
          x: 80, y: 520, length: 600, min: -5, max: 5, label: 'ℝ',
          highlights: [{ value: 0, label: 'origin' }, { value: 3, label: 'a' }],
        },
        { id: uid('fms-t1'), type: 'text', x: 750, y: 80, text: 'Parabola plot', size: 16, color: '#1e40af' },
        { id: uid('fms-t2'), type: 'text', x: 750, y: 110, text: 'vertex at (0,0)', size: 12, color: '#64748b' },
        { id: uid('fms-eq'), type: 'latex', x: 750, y: 160, tex: 'f(x) = x^2', displayMode: true, fontSize: 22 },
        { id: uid('fms-eq2'), type: 'latex', x: 750, y: 230, tex: "f'(x) = 2x", displayMode: true, fontSize: 18 },
      ];
      return { batch_id: batchId('full-math'), style_preset: 'blueprint_neat' as const, elements };
    },
  },

  /* 12 ── Geometry Showcase (triangle, angle_arc, vector_arrow, ellipse) */
  geometry_showcase: {
    label: 'Geometry Showcase',
    category: 'Examples',
    description: 'Triangle, angle arcs, vectors & circle',
    build: () => {
      const elements: DrawElement[] = [];
      const A = { x: 400, y: 120 };
      const B = { x: 250, y: 450 };
      const C = { x: 650, y: 450 };
      elements.push(
        { id: uid('gs-ab'), type: 'line', from: A, to: B, color: '#111827', stroke_width: 2 },
        { id: uid('gs-bc'), type: 'line', from: B, to: C, color: '#111827', stroke_width: 2 },
        { id: uid('gs-ca'), type: 'line', from: C, to: A, color: '#111827', stroke_width: 2 },
      );
      elements.push(
        { id: uid('gs-la'), type: 'text', x: A.x - 4, y: A.y - 14, text: 'A', size: 14, color: '#1e40af' },
        { id: uid('gs-lb'), type: 'text', x: B.x - 18, y: B.y + 8, text: 'B', size: 14, color: '#1e40af' },
        { id: uid('gs-lc'), type: 'text', x: C.x + 8, y: C.y + 8, text: 'C', size: 14, color: '#1e40af' },
      );
      elements.push(
        { id: uid('gs-angA'), type: 'angle_arc', x: A.x, y: A.y, radius: 30, startAngle: 245, endAngle: 295, label: 'α' },
        { id: uid('gs-angB'), type: 'angle_arc', x: B.x, y: B.y, radius: 30, startAngle: -25, endAngle: 65, label: 'β' },
        { id: uid('gs-angC'), type: 'angle_arc', x: C.x, y: C.y, radius: 30, startAngle: 115, endAngle: 205, label: 'γ' },
      );
      const midBC = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 };
      elements.push(
        { id: uid('gs-med'), type: 'vector_arrow', x: A.x, y: A.y, dx: midBC.x - A.x, dy: midBC.y - A.y, label: 'median', color: '#c61f1f' },
      );
      elements.push(
        { id: uid('gs-circ'), type: 'ellipse', cx: 435, cy: 310, rx: 200, ry: 200, color: '#2563eb', stroke_width: 1 },
      );
      elements.push(
        { id: uid('gs-sum'), type: 'latex', x: 750, y: 250, tex: '\\alpha + \\beta + \\gamma = 180°', fontSize: 16, displayMode: false },
      );
      return { batch_id: batchId('geo-showcase'), style_preset: 'clean_pen_sketch' as const, elements };
    },
  },

  /* 13 ── Linear Algebra (matrix_bracket + vector_arrow + latex) */
  linear_algebra: {
    label: 'Linear Algebra',
    category: 'Examples',
    description: 'Matrix, vectors & transformation equations',
    build: () => {
      const elements: DrawElement[] = [
        {
          id: uid('la-mat'), type: 'matrix_bracket',
          x: 120, y: 150, rows: [['2', '-1'], ['0', '3']], bracketStyle: '[]',
          cellWidth: 40, cellHeight: 32,
        },
        { id: uid('la-mlbl'), type: 'latex', x: 120, y: 120, tex: 'A =', fontSize: 20, displayMode: false },
        { id: uid('la-v1'), type: 'vector_arrow', x: 350, y: 400, dx: 150, dy: -100, label: 'v⃗', color: '#2563eb' },
        { id: uid('la-v2'), type: 'vector_arrow', x: 350, y: 400, dx: 200, dy: -250, label: 'Av⃗', color: '#c61f1f' },
        { id: uid('la-dot'), type: 'ellipse', cx: 350, cy: 400, rx: 4, ry: 4, color: '#111827', stroke_width: 2 },
        { id: uid('la-xa'), type: 'arrow', from: { x: 300, y: 400 }, to: { x: 650, y: 400 }, color: '#666666', stroke_width: 1 },
        { id: uid('la-ya'), type: 'arrow', from: { x: 350, y: 450 }, to: { x: 350, y: 100 }, color: '#666666', stroke_width: 1 },
        { id: uid('la-eq1'), type: 'latex', x: 700, y: 150, tex: 'A\\vec{v} = \\begin{bmatrix} 2 & -1 \\\\ 0 & 3 \\end{bmatrix} \\vec{v}', displayMode: true, fontSize: 18 },
        { id: uid('la-eq2'), type: 'latex', x: 700, y: 260, tex: '\\det(A) = 6', displayMode: true, fontSize: 16 },
        { id: uid('la-eq3'), type: 'latex', x: 700, y: 330, tex: '\\lambda_1 = 2, \\; \\lambda_2 = 3', displayMode: true, fontSize: 16 },
        { id: uid('la-title'), type: 'text', x: 120, y: 80, text: 'Linear Transformation', size: 18, color: '#1e40af' },
      ];
      return { batch_id: batchId('linalg'), style_preset: 'blueprint_neat' as const, elements };
    },
  },

  /* ── Wave 6 Templates ─── */

  /* 13 ── Calculus: FTC Demo — Fundamental Theorem of Calculus */
  ftc_demo: {
    label: '∫ Calculus: FTC Demo',
    category: 'Calculus',
    description: 'Fundamental Theorem of Calculus with Riemann sums',
    build: () => {
      const f = (x: number) => Math.sin(x) + 1;
      const curvePts = Array.from({ length: 81 }, (_, i) => {
        const xv = -0.5 + (5 * i) / 80;
        return { x: xv, y: f(xv) };
      });
      const topPts = Array.from({ length: 41 }, (_, i) => {
        const xv = 1 + (2 * i) / 40;
        return { x: xv, y: f(xv) };
      });
      const elements: DrawElement[] = [
        {
          id: uid('ftc-axes'), type: 'cartesian_axes',
          x: 80, y: 50, width: 700, height: 500,
          xRange: [-0.5, 4.5] as [number, number], yRange: [-0.5, 3] as [number, number],
          xLabel: 'x', yLabel: 'y', gridlines: true,
        },
        {
          id: uid('ftc-curve'), type: 'function_curve',
          x: 80, y: 50, width: 700, height: 500,
          xRange: [-0.5, 4.5] as [number, number], yRange: [-0.5, 3] as [number, number],
          points: curvePts, label: 'f(x) = sin(x) + 1',
          color: '#0a84ff', stroke_width: 2,
        },
        {
          id: uid('ftc-region'), type: 'integral_region',
          x: 80, y: 50, width: 700, height: 500,
          xRange: [1, 3] as [number, number], yRange: [-0.5, 3] as [number, number],
          topPoints: topPts,
          fillColor: 'rgba(30, 64, 175, 0.2)', strokeColor: '#1e40af',
          label: '∫₁³ f(x)dx',
        },
        {
          id: uid('ftc-riemann'), type: 'riemann_sum',
          x: 80, y: 50, width: 700, height: 500,
          xRange: [1, 3] as [number, number], yRange: [-0.5, 3] as [number, number],
          expression: 'Math.sin(x) + 1', n: 8, method: 'left' as const,
          showFunction: false, showAxes: false,
        },
        { id: uid('ftc-lbl1'), type: 'text', x: 820, y: 120, text: 'Area = ∫f(x)dx', size: 16, color: '#1e40af' },
        { id: uid('ftc-lbl2'), type: 'text', x: 820, y: 160, text: 'Left Riemann Sum', size: 14, color: '#666666' },
      ];
      return { batch_id: batchId('ftc'), style_preset: 'mathematical' as const, elements };
    },
  },

  /* 14 ── Linear Algebra: 2D Rotation */
  rotation_2d: {
    label: '🔄 2D Rotation',
    category: 'Linear Algebra',
    description: '45° rotation matrix with transformed basis vectors',
    build: () => {
      const c = 0.707;
      const elements: DrawElement[] = [
        {
          id: uid('rot-tf'), type: 'linear_transform',
          x: 80, y: 60, width: 500, height: 500,
          matrix: [[c, -c], [c, c]] as [[number, number], [number, number]],
          showBasisVectors: true, showOriginalGrid: true, gridRange: 3,
          label: 'Rotation by 45°',
        },
        { id: uid('rot-e1'), type: 'vector_arrow', x: 330, y: 310, dx: 140, dy: 0, label: 'e₁', color: '#2563eb', stroke_width: 2 },
        { id: uid('rot-e2'), type: 'vector_arrow', x: 330, y: 310, dx: 0, dy: -140, label: 'e₂', color: '#059669', stroke_width: 2 },
        { id: uid('rot-title'), type: 'text', x: 80, y: 30, text: 'Rotation by 45°', size: 18, color: '#1e40af' },
        { id: uid('rot-te1'), type: 'text', x: 620, y: 150, text: 'T(e₁) = (cos45°, sin45°)', size: 14, color: '#2563eb' },
        { id: uid('rot-te2'), type: 'text', x: 620, y: 190, text: 'T(e₂) = (-sin45°, cos45°)', size: 14, color: '#059669' },
        {
          id: uid('rot-mat'), type: 'matrix_bracket',
          x: 620, y: 260, rows: [['0.707', '-0.707'], ['0.707', '0.707']],
          bracketStyle: '[]', cellWidth: 55, cellHeight: 32,
        },
        { id: uid('rot-mlbl'), type: 'latex', x: 620, y: 230, tex: 'R_{45°} =', fontSize: 18, displayMode: false },
      ];
      return { batch_id: batchId('rotation'), style_preset: 'blueprint_neat' as const, elements };
    },
  },

  /* 15 ── Statistics: Normal Distribution with Histogram */
  normal_dist: {
    label: '📊 Normal Distribution',
    category: 'Statistics',
    description: 'Bell curve overlaid on histogram data',
    build: () => {
      const binLabels = ['-2.5', '-2', '-1.5', '-1', '-0.5', '0', '0.5', '1', '1.5', '2'];
      const binValues = [2, 5, 12, 22, 30, 34, 28, 18, 8, 3];
      const elements: DrawElement[] = [
        {
          id: uid('nd-hist'), type: 'histogram',
          x: 100, y: 80, width: 600, height: 400,
          bins: binLabels.map((label, i) => ({ label, value: binValues[i] })),
          showValues: true, showAxes: true,
          xLabel: 'Value', yLabel: 'Frequency',
        },
        {
          id: uid('nd-curve'), type: 'normal_distribution',
          x: 100, y: 80, width: 600, height: 400,
          mu: 0, sigma: 1,
          showMeanLine: true, showSigmaLines: true, showLabels: true,
        },
        { id: uid('nd-title'), type: 'text', x: 280, y: 30, text: 'Normal Distribution', size: 20, color: '#1e40af' },
        { id: uid('nd-mu'), type: 'latex', x: 750, y: 150, tex: '\\mu = 0', fontSize: 18, displayMode: false },
        { id: uid('nd-sigma'), type: 'latex', x: 750, y: 200, tex: '\\sigma = 1', fontSize: 18, displayMode: false },
        { id: uid('nd-formula'), type: 'latex', x: 750, y: 280, tex: 'f(x) = \\frac{1}{\\sqrt{2\\pi}} e^{-x^2/2}', fontSize: 14, displayMode: true },
      ];
      return { batch_id: batchId('normal'), style_preset: 'mathematical' as const, elements };
    },
  },

  /* 16 ── Calculus: Derivative at Point */
  derivative_point: {
    label: "📐 Derivative at Point",
    category: 'Calculus',
    description: 'f(x)=x²−2x+2 with tangent line at x=2',
    build: () => {
      const f = (x: number) => x * x - 2 * x + 2;
      const curvePts = Array.from({ length: 61 }, (_, i) => {
        const xv = -2 + (6 * i) / 60;
        return { x: xv, y: f(xv) };
      });
      const elements: DrawElement[] = [
        {
          id: uid('dp-axes'), type: 'cartesian_axes',
          x: 100, y: 50, width: 600, height: 450,
          xRange: [-2, 4] as [number, number], yRange: [-1, 5] as [number, number],
          xLabel: 'x', yLabel: 'y', gridlines: true,
        },
        {
          id: uid('dp-curve'), type: 'function_curve',
          x: 100, y: 50, width: 600, height: 450,
          xRange: [-2, 4] as [number, number], yRange: [-1, 5] as [number, number],
          points: curvePts, label: 'f(x) = x² − 2x + 2',
          color: '#0a84ff', stroke_width: 2,
        },
        {
          id: uid('dp-tan'), type: 'tangent_line',
          x: 100, y: 50, width: 600, height: 450,
          xRange: [-2, 4] as [number, number], yRange: [-1, 5] as [number, number],
          expression: 'x*x - 2*x + 2', atX: 2,
          length: 2.5, showPoint: true,
          label: "f'(2) = 2", color: '#dc2626',
        },
        { id: uid('dp-flbl'), type: 'latex', x: 740, y: 100, tex: 'f(x) = x^2 - 2x + 2', fontSize: 18, displayMode: false },
        { id: uid('dp-dlbl'), type: 'latex', x: 740, y: 160, tex: "f'(x) = 2x - 2", fontSize: 16, displayMode: false },
        { id: uid('dp-val'), type: 'latex', x: 740, y: 220, tex: "f'(2) = 2", fontSize: 16, displayMode: false, color: '#dc2626' },
        { id: uid('dp-pt'), type: 'text', x: 740, y: 280, text: 'Point: (2, 2)', size: 14, color: '#666666' },
      ];
      return { batch_id: batchId('deriv-pt'), style_preset: 'mathematical' as const, elements };
    },
  },

  /* 17 ── Parametric: Lissajous Figure */
  lissajous: {
    label: '🌀 Lissajous Figure',
    category: 'Calculus',
    description: 'Parametric curve x=sin(3t), y=sin(2t)',
    build: () => {
      const elements: DrawElement[] = [
        {
          id: uid('lj-curve'), type: 'parametric_curve',
          x: 150, y: 50, width: 500, height: 500,
          xRange: [-1.3, 1.3] as [number, number], yRange: [-1.3, 1.3] as [number, number],
          tMin: 0, tMax: 2 * Math.PI,
          xExpression: 'Math.sin(3*t)', yExpression: 'Math.sin(2*t)',
          steps: 300, label: 'Lissajous 3:2',
          color: '#7c3aed', stroke_width: 2,
        },
        { id: uid('lj-title'), type: 'text', x: 280, y: 20, text: 'Lissajous Figure', size: 20, color: '#1e40af' },
        { id: uid('lj-eq1'), type: 'latex', x: 700, y: 150, tex: 'x(t) = \\sin(3t)', fontSize: 18, displayMode: false },
        { id: uid('lj-eq2'), type: 'latex', x: 700, y: 210, tex: 'y(t) = \\sin(2t)', fontSize: 18, displayMode: false },
        { id: uid('lj-range'), type: 'latex', x: 700, y: 280, tex: 't \\in [0, 2\\pi]', fontSize: 16, displayMode: false, color: '#666666' },
      ];
      return { batch_id: batchId('lissajous'), style_preset: 'mathematical' as const, elements };
    },
  },

  /* 18 ── Polar: Rose Curve */
  rose_curve: {
    label: '🌸 Rose Curve',
    category: 'Calculus',
    description: 'Polar plot r = cos(3θ)',
    build: () => {
      const elements: DrawElement[] = [
        {
          id: uid('rc-plot'), type: 'polar_plot',
          cx: 400, cy: 320, radius: 220,
          expression: 'Math.cos(3*theta)',
          thetaMin: 0, thetaMax: Math.PI,
          steps: 300, showPolarGrid: true,
          label: 'r = cos(3θ)',
          color: '#e11d48', stroke_width: 2,
        },
        { id: uid('rc-title'), type: 'text', x: 300, y: 30, text: 'Rose Curve (3 petals)', size: 20, color: '#1e40af' },
        { id: uid('rc-eq'), type: 'latex', x: 680, y: 150, tex: 'r = \\cos(3\\theta)', fontSize: 22, displayMode: false },
        { id: uid('rc-range'), type: 'latex', x: 680, y: 220, tex: '\\theta \\in [0, \\pi]', fontSize: 16, displayMode: false, color: '#666666' },
        { id: uid('rc-note'), type: 'text', x: 680, y: 290, text: 'k=3 → 3 petals', size: 14, color: '#666666' },
      ];
      return { batch_id: batchId('rose'), style_preset: 'mathematical' as const, elements };
    },
  },

  /* 19 ── Matrix Operations — A × B = C */
  matrix_ops: {
    label: '🔢 Matrix Operations',
    category: 'Linear Algebra',
    description: '2×2 matrix multiplication A × B = C',
    build: () => {
      const elements: DrawElement[] = [
        { id: uid('mo-title'), type: 'text', x: 300, y: 50, text: 'Matrix Multiplication', size: 20, color: '#1e40af' },
        { id: uid('mo-albl'), type: 'latex', x: 120, y: 120, tex: 'A =', fontSize: 18, displayMode: false },
        {
          id: uid('mo-a'), type: 'matrix_bracket',
          x: 170, y: 130, rows: [['2', '1'], ['0', '3']],
          bracketStyle: '[]', cellWidth: 40, cellHeight: 36,
        },
        {
          id: uid('mo-times'), type: 'arrow',
          from: { x: 280, y: 165 }, to: { x: 320, y: 165 },
          label: '×', color: '#111827', stroke_width: 2,
        },
        { id: uid('mo-blbl'), type: 'latex', x: 340, y: 120, tex: 'B =', fontSize: 18, displayMode: false },
        {
          id: uid('mo-b'), type: 'matrix_bracket',
          x: 390, y: 130, rows: [['4', '-1'], ['2', '5']],
          bracketStyle: '[]', cellWidth: 40, cellHeight: 36,
        },
        { id: uid('mo-eq'), type: 'text', x: 510, y: 155, text: '=', size: 28 },
        { id: uid('mo-clbl'), type: 'latex', x: 550, y: 120, tex: 'C =', fontSize: 18, displayMode: false },
        {
          id: uid('mo-c'), type: 'matrix_bracket',
          x: 600, y: 130, rows: [['10', '3'], ['6', '15']],
          bracketStyle: '[]', cellWidth: 40, cellHeight: 36, color: '#1e40af',
        },
        { id: uid('mo-formula'), type: 'latex', x: 120, y: 260, tex: 'C_{ij} = \\sum_k A_{ik} B_{kj}', fontSize: 18, displayMode: true },
        { id: uid('mo-ex1'), type: 'latex', x: 120, y: 340, tex: 'C_{11} = 2 \\cdot 4 + 1 \\cdot 2 = 10', fontSize: 14, displayMode: false, color: '#666666' },
        { id: uid('mo-ex2'), type: 'latex', x: 120, y: 380, tex: 'C_{12} = 2 \\cdot (-1) + 1 \\cdot 5 = 3', fontSize: 14, displayMode: false, color: '#666666' },
      ];
      return { batch_id: batchId('matops'), style_preset: 'blueprint_neat' as const, elements };
    },
  },

  /* 20 ── Probability Tree — Bernoulli Process */
  probability_tree: {
    label: '🎲 Probability Tree',
    category: 'Statistics',
    description: 'Bernoulli trial tree with p=0.7',
    build: () => {
      const elements: DrawElement[] = [
        { id: uid('pt-title'), type: 'text', x: 350, y: 30, text: 'Bernoulli Process', size: 20, color: '#1e40af' },
        // Root node
        { id: uid('pt-root'), type: 'ellipse', cx: 200, cy: 250, rx: 24, ry: 24, color: '#1e40af', stroke_width: 2 },
        { id: uid('pt-rlbl'), type: 'text', x: 192, y: 244, text: 'Start', size: 10, color: '#1e40af' },
        // Success branch (top)
        { id: uid('pt-s1'), type: 'line', from: { x: 224, y: 238 }, to: { x: 396, y: 150 }, color: '#059669', stroke_width: 2 },
        { id: uid('pt-s1p'), type: 'text', x: 280, y: 175, text: 'p=0.7', size: 13, color: '#059669' },
        { id: uid('pt-s1n'), type: 'ellipse', cx: 420, cy: 140, rx: 22, ry: 22, color: '#059669', stroke_width: 2 },
        { id: uid('pt-s1l'), type: 'text', x: 412, y: 134, text: 'S', size: 14, color: '#059669' },
        // Failure branch (bottom)
        { id: uid('pt-f1'), type: 'line', from: { x: 224, y: 262 }, to: { x: 396, y: 350 }, color: '#dc2626', stroke_width: 2 },
        { id: uid('pt-f1p'), type: 'text', x: 280, y: 325, text: 'p=0.3', size: 13, color: '#dc2626' },
        { id: uid('pt-f1n'), type: 'ellipse', cx: 420, cy: 360, rx: 22, ry: 22, color: '#dc2626', stroke_width: 2 },
        { id: uid('pt-f1l'), type: 'text', x: 414, y: 354, text: 'F', size: 14, color: '#dc2626' },
        // Second level — from S
        { id: uid('pt-ss'), type: 'line', from: { x: 442, y: 130 }, to: { x: 596, y: 90 }, color: '#059669', stroke_width: 1 },
        { id: uid('pt-ssp'), type: 'text', x: 500, y: 92, text: '0.7', size: 11, color: '#059669' },
        { id: uid('pt-ssn'), type: 'ellipse', cx: 620, cy: 80, rx: 18, ry: 18, color: '#059669', stroke_width: 2 },
        { id: uid('pt-ssl'), type: 'text', x: 612, y: 74, text: 'SS', size: 11, color: '#059669' },
        { id: uid('pt-sf'), type: 'line', from: { x: 442, y: 150 }, to: { x: 596, y: 190 }, color: '#dc2626', stroke_width: 1 },
        { id: uid('pt-sfp'), type: 'text', x: 500, y: 185, text: '0.3', size: 11, color: '#dc2626' },
        { id: uid('pt-sfn'), type: 'ellipse', cx: 620, cy: 200, rx: 18, ry: 18, color: '#dc2626', stroke_width: 2 },
        { id: uid('pt-sfl'), type: 'text', x: 612, y: 194, text: 'SF', size: 11, color: '#b45309' },
        // Second level — from F
        { id: uid('pt-fs'), type: 'line', from: { x: 442, y: 350 }, to: { x: 596, y: 310 }, color: '#059669', stroke_width: 1 },
        { id: uid('pt-fsp'), type: 'text', x: 500, y: 312, text: '0.7', size: 11, color: '#059669' },
        { id: uid('pt-fsn'), type: 'ellipse', cx: 620, cy: 300, rx: 18, ry: 18, color: '#059669', stroke_width: 2 },
        { id: uid('pt-fsl'), type: 'text', x: 612, y: 294, text: 'FS', size: 11, color: '#b45309' },
        { id: uid('pt-ff'), type: 'line', from: { x: 442, y: 370 }, to: { x: 596, y: 410 }, color: '#dc2626', stroke_width: 1 },
        { id: uid('pt-ffp'), type: 'text', x: 500, y: 405, text: '0.3', size: 11, color: '#dc2626' },
        { id: uid('pt-ffn'), type: 'ellipse', cx: 620, cy: 420, rx: 18, ry: 18, color: '#dc2626', stroke_width: 2 },
        { id: uid('pt-ffl'), type: 'text', x: 612, y: 414, text: 'FF', size: 11, color: '#dc2626' },
        // Probabilities on right
        { id: uid('pt-pss'), type: 'text', x: 660, y: 74, text: 'P=0.49', size: 12, color: '#111827' },
        { id: uid('pt-psf'), type: 'text', x: 660, y: 194, text: 'P=0.21', size: 12, color: '#111827' },
        { id: uid('pt-pfs'), type: 'text', x: 660, y: 294, text: 'P=0.21', size: 12, color: '#111827' },
        { id: uid('pt-pff'), type: 'text', x: 660, y: 414, text: 'P=0.09', size: 12, color: '#111827' },
      ];
      return { batch_id: batchId('probtree'), style_preset: 'clean_pen_sketch' as const, elements };
    },
  },
};

// ---------------------------------------------------------------------------
// Payload history (localStorage)
// ---------------------------------------------------------------------------

const HISTORY_KEY = 'draw-injector-history';
const MAX_HISTORY = 5;

interface HistoryEntry {
  timestamp: number;
  elementCount: number;
  firstType: string;
  json: string;
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveToHistory(json: string, elementCount: number, firstType: string) {
  const entries = loadHistory();
  entries.unshift({ timestamp: Date.now(), json, elementCount, firstType });
  if (entries.length > MAX_HISTORY) entries.length = MAX_HISTORY;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch { /* quota exceeded — silently ignore */ }
}

// ---------------------------------------------------------------------------
// Quick-inject element types & form configs
// ---------------------------------------------------------------------------

const QUICK_ELEMENT_TYPES = [
  'rect', 'ellipse', 'line', 'arrow', 'text',
  'cartesian_axes', 'number_line', 'function_curve',
] as const;
type QuickElementType = (typeof QUICK_ELEMENT_TYPES)[number];

const QUICK_ELEMENT_LABELS: Record<QuickElementType, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
  text: 'Text',
  cartesian_axes: 'Cartesian Axes',
  number_line: 'Number Line',
  function_curve: 'Function Curve',
};

function buildQuickBatch(type: QuickElementType, fields: Record<string, string>): DrawBatch {
  const color = fields.color || '#0a84ff';
  const id = `qi-${type}-${Date.now().toString(36)}`;
  let element: DrawElement;

  switch (type) {
    case 'rect':
      element = { id, type: 'rect', x: num(fields.x, 100), y: num(fields.y, 100), w: num(fields.w, 200), h: num(fields.h, 150), color };
      break;
    case 'ellipse':
      element = { id, type: 'ellipse', cx: num(fields.cx, 300), cy: num(fields.cy, 300), rx: num(fields.rx, 100), ry: num(fields.ry, 80), color };
      break;
    case 'line':
      element = { id, type: 'line', from: { x: num(fields.x1, 100), y: num(fields.y1, 100) }, to: { x: num(fields.x2, 400), y: num(fields.y2, 300) }, color, stroke_width: num(fields.sw, 2) };
      break;
    case 'arrow':
      element = { id, type: 'arrow', from: { x: num(fields.x1, 100), y: num(fields.y1, 300) }, to: { x: num(fields.x2, 400), y: num(fields.y2, 100) }, color, stroke_width: num(fields.sw, 2) };
      break;
    case 'text':
      element = { id, type: 'text', x: num(fields.x, 200), y: num(fields.y, 200), text: fields.content || 'Hello', size: num(fields.size, 18), color };
      break;
    case 'cartesian_axes':
      element = {
        id, type: 'cartesian_axes', x: 100, y: 60, width: 800, height: 600,
        xRange: [num(fields.xMin, -5), num(fields.xMax, 5)],
        yRange: [num(fields.yMin, -5), num(fields.yMax, 5)],
        xLabel: fields.xLabel || 'x', yLabel: fields.yLabel || 'y', gridlines: true,
      };
      break;
    case 'number_line':
      element = {
        id, type: 'number_line', x: 100, y: 350, length: num(fields.length, 800),
        min: num(fields.min, -5), max: num(fields.max, 5), label: fields.label || 'ℝ',
      };
      break;
    case 'function_curve':
      element = {
        id, type: 'function_curve', x: 100, y: 60, width: 800, height: 600,
        expression: fields.expression || 'sin(x)',
        xRange: [num(fields.xMin, -6.28), num(fields.xMax, 6.28)],
        yRange: [num(fields.yMin, -2), num(fields.yMax, 2)],
        label: fields.label || '', color,
      };
      break;
    default:
      element = { id, type: 'rect', x: 100, y: 100, w: 200, h: 150 };
  }

  return {
    batch_id: `quick-${Date.now().toString(36)}`,
    style_preset: 'clean_pen_sketch',
    elements: [element],
  };
}

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Quick-inject form field configs per element type
// ---------------------------------------------------------------------------

interface FieldDef { key: string; label: string; defaultValue: string; type?: 'text' | 'number' | 'color'; }

const QUICK_FIELDS: Record<QuickElementType, FieldDef[]> = {
  rect: [
    { key: 'x', label: 'X', defaultValue: '100', type: 'number' },
    { key: 'y', label: 'Y', defaultValue: '100', type: 'number' },
    { key: 'w', label: 'Width', defaultValue: '200', type: 'number' },
    { key: 'h', label: 'Height', defaultValue: '150', type: 'number' },
    { key: 'color', label: 'Color', defaultValue: '#0a84ff', type: 'color' },
  ],
  ellipse: [
    { key: 'cx', label: 'Center X', defaultValue: '300', type: 'number' },
    { key: 'cy', label: 'Center Y', defaultValue: '300', type: 'number' },
    { key: 'rx', label: 'Radius X', defaultValue: '100', type: 'number' },
    { key: 'ry', label: 'Radius Y', defaultValue: '80', type: 'number' },
    { key: 'color', label: 'Color', defaultValue: '#0a84ff', type: 'color' },
  ],
  line: [
    { key: 'x1', label: 'From X', defaultValue: '100', type: 'number' },
    { key: 'y1', label: 'From Y', defaultValue: '100', type: 'number' },
    { key: 'x2', label: 'To X', defaultValue: '400', type: 'number' },
    { key: 'y2', label: 'To Y', defaultValue: '300', type: 'number' },
    { key: 'sw', label: 'Stroke', defaultValue: '2', type: 'number' },
    { key: 'color', label: 'Color', defaultValue: '#111827', type: 'color' },
  ],
  arrow: [
    { key: 'x1', label: 'From X', defaultValue: '100', type: 'number' },
    { key: 'y1', label: 'From Y', defaultValue: '300', type: 'number' },
    { key: 'x2', label: 'To X', defaultValue: '400', type: 'number' },
    { key: 'y2', label: 'To Y', defaultValue: '100', type: 'number' },
    { key: 'sw', label: 'Stroke', defaultValue: '2', type: 'number' },
    { key: 'color', label: 'Color', defaultValue: '#111827', type: 'color' },
  ],
  text: [
    { key: 'x', label: 'X', defaultValue: '200', type: 'number' },
    { key: 'y', label: 'Y', defaultValue: '200', type: 'number' },
    { key: 'content', label: 'Text', defaultValue: 'Hello', type: 'text' },
    { key: 'size', label: 'Font Size', defaultValue: '18', type: 'number' },
    { key: 'color', label: 'Color', defaultValue: '#111827', type: 'color' },
  ],
  cartesian_axes: [
    { key: 'xMin', label: 'X Min', defaultValue: '-5', type: 'number' },
    { key: 'xMax', label: 'X Max', defaultValue: '5', type: 'number' },
    { key: 'yMin', label: 'Y Min', defaultValue: '-5', type: 'number' },
    { key: 'yMax', label: 'Y Max', defaultValue: '5', type: 'number' },
    { key: 'xLabel', label: 'X Label', defaultValue: 'x', type: 'text' },
    { key: 'yLabel', label: 'Y Label', defaultValue: 'y', type: 'text' },
  ],
  number_line: [
    { key: 'min', label: 'Min', defaultValue: '-5', type: 'number' },
    { key: 'max', label: 'Max', defaultValue: '5', type: 'number' },
    { key: 'length', label: 'Length', defaultValue: '800', type: 'number' },
    { key: 'label', label: 'Label', defaultValue: 'ℝ', type: 'text' },
  ],
  function_curve: [
    { key: 'expression', label: 'f(x)', defaultValue: 'sin(x)', type: 'text' },
    { key: 'xMin', label: 'X From', defaultValue: '-6.28', type: 'number' },
    { key: 'xMax', label: 'X To', defaultValue: '6.28', type: 'number' },
    { key: 'yMin', label: 'Y From', defaultValue: '-2', type: 'number' },
    { key: 'yMax', label: 'Y To', defaultValue: '2', type: 'number' },
    { key: 'label', label: 'Label', defaultValue: '', type: 'text' },
    { key: 'color', label: 'Color', defaultValue: '#0a84ff', type: 'color' },
  ],
};

// ---------------------------------------------------------------------------
// Bracket matching pairs
// ---------------------------------------------------------------------------

const BRACKET_PAIRS: Record<string, string> = { '{': '}', '[': ']', '"': '"' };

type TabId = 'json' | 'templates' | 'history' | 'build';
// ---------------------------------------------------------------------------
// AI-assisted JSON generation — client-side keyword matching
// ---------------------------------------------------------------------------

function generateBatchFromDescription(description: string): DrawBatch {
  const d = description.toLowerCase().trim();
  const elements: DrawElement[] = [];
  const ts = Date.now().toString(36);

  if (/\b(sin|cos|tan)\b/.test(d)) {
    const match = d.match(/\b(sin|cos|tan)\b/);
    const fn = match![1];
    const hasAxes = /\b(ax[ei]s|coordinate)\b/.test(d);
    if (hasAxes) {
      elements.push({
        id: `ai-axes-${ts}`, type: 'cartesian_axes',
        x: 100, y: 60, width: 800, height: 600,
        xRange: [-7, 7], yRange: [-2, 2],
        xLabel: 'x', yLabel: 'y', gridlines: true,
      });
    }
    elements.push({
      id: `ai-curve-${ts}`, type: 'function_curve',
      x: 100, y: 60, width: 800, height: 600,
      expression: `${fn}(x)`,
      xRange: [-6.28, 6.28], yRange: [-2, 2],
      label: `f(x) = ${fn}(x)`, color: '#0a84ff',
    });
  } else if (/\bcircle\b/.test(d)) {
    const radiusMatch = d.match(/radius\s*[=:]?\s*(\d+)/);
    const r = radiusMatch ? parseInt(radiusMatch[1], 10) : 120;
    elements.push({
      id: `ai-circ-${ts}`, type: 'ellipse',
      cx: 400, cy: 350, rx: r, ry: r, color: '#0a84ff', stroke_width: 2,
    });
  } else if (/\b(ax[ei]s|coordinate)\b/.test(d)) {
    elements.push({
      id: `ai-axes-${ts}`, type: 'cartesian_axes',
      x: 100, y: 60, width: 800, height: 600,
      xRange: [-5, 5], yRange: [-5, 5],
      xLabel: 'x', yLabel: 'y', gridlines: true,
    });
  } else if (/\bintegral\b/.test(d)) {
    const topPts = Array.from({ length: 41 }, (_, i) => {
      const xv = 1 + (2 * i) / 40;
      return { x: xv, y: xv * xv };
    });
    elements.push(
      {
        id: `ai-ig-axes-${ts}`, type: 'cartesian_axes',
        x: 100, y: 50, width: 700, height: 500,
        xRange: [-0.5, 4.5] as [number, number], yRange: [-0.5, 10] as [number, number],
        xLabel: 'x', yLabel: 'y', gridlines: true,
      },
      {
        id: `ai-ig-region-${ts}`, type: 'integral_region',
        x: 100, y: 50, width: 700, height: 500,
        xRange: [1, 3] as [number, number], yRange: [-0.5, 10] as [number, number],
        topPoints: topPts,
        fillColor: 'rgba(30, 64, 175, 0.2)', strokeColor: '#1e40af',
        label: '\u222b\u2081\u00b3 x\u00b2dx',
      },
    );
  } else if (/\b(normal|bell\s*curve)\b/.test(d)) {
    elements.push({
      id: `ai-norm-${ts}`, type: 'normal_distribution',
      x: 100, y: 80, width: 600, height: 400,
      mu: 0, sigma: 1,
      showMeanLine: true, showSigmaLines: true, showLabels: true,
    });
  } else if (/\bhistogram\b/.test(d)) {
    elements.push({
      id: `ai-hist-${ts}`, type: 'histogram',
      x: 100, y: 80, width: 600, height: 400,
      bins: [
        { label: 'A', value: 12 }, { label: 'B', value: 25 },
        { label: 'C', value: 18 }, { label: 'D', value: 30 },
        { label: 'E', value: 15 },
      ],
      showValues: true, showAxes: true,
      xLabel: 'Category', yLabel: 'Count',
    });
  } else if (/\bmatrix\b/.test(d)) {
    elements.push({
      id: `ai-mat-${ts}`, type: 'matrix_bracket',
      x: 200, y: 200, rows: [['1', '0'], ['0', '1']],
      bracketStyle: '[]', cellWidth: 40, cellHeight: 32,
    });
  } else if (/\bvector\b/.test(d)) {
    elements.push({
      id: `ai-vec-${ts}`, type: 'vector_arrow',
      x: 200, y: 400, dx: 250, dy: -200, label: 'v\u20d7', color: '#0a84ff',
    });
  } else {
    const labelText = description.trim().substring(0, 60) || 'Element';
    elements.push(
      { id: `ai-rect-${ts}`, type: 'rect', x: 150, y: 150, w: 300, h: 200, color: '#0a84ff', stroke_width: 2 },
      { id: `ai-txt-${ts}`, type: 'text', x: 170, y: 180, text: labelText, size: 16, color: '#111827' },
    );
  }

  return {
    batch_id: `ai-gen-${ts}`,
    style_preset: 'clean_pen_sketch',
    elements,
  };
}

// ---------------------------------------------------------------------------
// Build-tab element type configs
// ---------------------------------------------------------------------------

const BUILD_ELEMENT_TYPES = [
  'rect', 'ellipse', 'line', 'arrow', 'text', 'function_curve', 'cartesian_axes',
] as const;
type BuildElementType = (typeof BUILD_ELEMENT_TYPES)[number];

const BUILD_ELEMENT_LABELS: Record<BuildElementType, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
  text: 'Text',
  function_curve: 'Function Curve',
  cartesian_axes: 'Cartesian Axes',
};

interface BuildFieldDef { key: string; label: string; defaultValue: string; type?: 'text' | 'number' | 'color'; }

const BUILD_FIELDS: Record<BuildElementType, BuildFieldDef[]> = {
  rect: [
    { key: 'x', label: 'X', defaultValue: '100', type: 'number' },
    { key: 'y', label: 'Y', defaultValue: '100', type: 'number' },
    { key: 'w', label: 'Width', defaultValue: '200', type: 'number' },
    { key: 'h', label: 'Height', defaultValue: '150', type: 'number' },
    { key: 'color', label: 'Color', defaultValue: '#0a84ff', type: 'color' },
  ],
  ellipse: [
    { key: 'cx', label: 'Center X', defaultValue: '300', type: 'number' },
    { key: 'cy', label: 'Center Y', defaultValue: '300', type: 'number' },
    { key: 'rx', label: 'Radius X', defaultValue: '100', type: 'number' },
    { key: 'ry', label: 'Radius Y', defaultValue: '80', type: 'number' },
    { key: 'color', label: 'Color', defaultValue: '#0a84ff', type: 'color' },
  ],
  line: [
    { key: 'x1', label: 'From X', defaultValue: '100', type: 'number' },
    { key: 'y1', label: 'From Y', defaultValue: '100', type: 'number' },
    { key: 'x2', label: 'To X', defaultValue: '400', type: 'number' },
    { key: 'y2', label: 'To Y', defaultValue: '300', type: 'number' },
    { key: 'color', label: 'Color', defaultValue: '#111827', type: 'color' },
  ],
  arrow: [
    { key: 'x1', label: 'From X', defaultValue: '100', type: 'number' },
    { key: 'y1', label: 'From Y', defaultValue: '300', type: 'number' },
    { key: 'x2', label: 'To X', defaultValue: '400', type: 'number' },
    { key: 'y2', label: 'To Y', defaultValue: '100', type: 'number' },
    { key: 'color', label: 'Color', defaultValue: '#111827', type: 'color' },
  ],
  text: [
    { key: 'x', label: 'X', defaultValue: '200', type: 'number' },
    { key: 'y', label: 'Y', defaultValue: '200', type: 'number' },
    { key: 'content', label: 'Text', defaultValue: 'Hello', type: 'text' },
    { key: 'size', label: 'Font Size', defaultValue: '18', type: 'number' },
    { key: 'color', label: 'Color', defaultValue: '#111827', type: 'color' },
  ],
  function_curve: [
    { key: 'expression', label: 'f(x)', defaultValue: 'sin(x)', type: 'text' },
    { key: 'xMin', label: 'X From', defaultValue: '-6.28', type: 'number' },
    { key: 'xMax', label: 'X To', defaultValue: '6.28', type: 'number' },
    { key: 'yMin', label: 'Y From', defaultValue: '-2', type: 'number' },
    { key: 'yMax', label: 'Y To', defaultValue: '2', type: 'number' },
    { key: 'label', label: 'Label', defaultValue: '', type: 'text' },
    { key: 'color', label: 'Color', defaultValue: '#0a84ff', type: 'color' },
  ],
  cartesian_axes: [
    { key: 'xMin', label: 'X Min', defaultValue: '-5', type: 'number' },
    { key: 'xMax', label: 'X Max', defaultValue: '5', type: 'number' },
    { key: 'yMin', label: 'Y Min', defaultValue: '-5', type: 'number' },
    { key: 'yMax', label: 'Y Max', defaultValue: '5', type: 'number' },
    { key: 'xLabel', label: 'X Label', defaultValue: 'x', type: 'text' },
    { key: 'yLabel', label: 'Y Label', defaultValue: 'y', type: 'text' },
  ],
};

function buildElementFromFields(type: BuildElementType, fields: Record<string, string>): DrawElement {
  const color = fields.color || '#0a84ff';
  const id = `build-${type}-${Date.now().toString(36)}`;

  switch (type) {
    case 'rect':
      return { id, type: 'rect', x: num(fields.x, 100), y: num(fields.y, 100), w: num(fields.w, 200), h: num(fields.h, 150), color };
    case 'ellipse':
      return { id, type: 'ellipse', cx: num(fields.cx, 300), cy: num(fields.cy, 300), rx: num(fields.rx, 100), ry: num(fields.ry, 80), color };
    case 'line':
      return { id, type: 'line', from: { x: num(fields.x1, 100), y: num(fields.y1, 100) }, to: { x: num(fields.x2, 400), y: num(fields.y2, 300) }, color, stroke_width: 2 };
    case 'arrow':
      return { id, type: 'arrow', from: { x: num(fields.x1, 100), y: num(fields.y1, 300) }, to: { x: num(fields.x2, 400), y: num(fields.y2, 100) }, color, stroke_width: 2 };
    case 'text':
      return { id, type: 'text', x: num(fields.x, 200), y: num(fields.y, 200), text: fields.content || 'Hello', size: num(fields.size, 18), color };
    case 'function_curve':
      return {
        id, type: 'function_curve', x: 100, y: 60, width: 800, height: 600,
        expression: fields.expression || 'sin(x)',
        xRange: [num(fields.xMin, -6.28), num(fields.xMax, 6.28)],
        yRange: [num(fields.yMin, -2), num(fields.yMax, 2)],
        label: fields.label || '', color,
      };
    case 'cartesian_axes':
      return {
        id, type: 'cartesian_axes', x: 100, y: 60, width: 800, height: 600,
        xRange: [num(fields.xMin, -5), num(fields.xMax, 5)],
        yRange: [num(fields.yMin, -5), num(fields.yMax, 5)],
        xLabel: fields.xLabel || 'x', yLabel: fields.yLabel || 'y', gridlines: true,
      };
    default:
      return { id, type: 'rect', x: 100, y: 100, w: 200, h: 150 };
  }
}


const DEFAULT_JSON = JSON.stringify(
  {
    batch_id: 'inject-001',
    style_preset: 'clean_pen_sketch',
    elements: [
      { id: 'r1', type: 'rect', x: 100, y: 100, w: 200, h: 150 },
      { id: 't1', type: 'text', x: 120, y: 130, text: 'Hello', size: 18 },
    ],
  },
  null,
  2,
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DrawPayloadInjectorProps {
  onInject: (batch: DrawBatch) => void;
  /** Session ID passed to the inject API for rate limiting. */
  sessionId?: string;
  /** When true the panel is rendered open (controlled by MobilePanelSwitcher). */
  forceOpen?: boolean;
  /** Ref callback to expose a toggle function to the parent. */
  toggleRef?: React.MutableRefObject<(() => void) | null>;
}

export const DrawPayloadInjector = memo(function DrawPayloadInjector({
  onInject,
  sessionId,
  forceOpen,
  toggleRef,
}: DrawPayloadInjectorProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const isVisible = forceOpen ?? open;

  // Expose toggle function to parent via ref
  useEffect(() => {
    if (toggleRef) {
      toggleRef.current = () => setOpen((v) => !v);
      return () => { toggleRef.current = null; };
    }
  }, [toggleRef]);
  const [tab, setTab] = useState<TabId>('json');
  const [jsonText, setJsonText] = useState(DEFAULT_JSON);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('All');

  const { inject, isInjecting, error: hookError, clearError } = useDrawInjector(sessionId);
  const [copiedError, setCopiedError] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);

  // New state — format feedback
  const [formatFeedback, setFormatFeedback] = useState(false);

  // Color theme selector handler
  const handleThemeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const theme = e.target.value;
    try {
      const parsed = JSON.parse(jsonText);
      if (theme === 'default') {
        delete parsed.colorTheme;
      } else {
        parsed.colorTheme = theme;
      }
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch {
      // JSON is invalid — can't inject theme
    }
  }, [jsonText]);

  // Derive current theme from JSON for the dropdown
  const currentTheme = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.colorTheme && ['default', 'dark', 'colorful', 'pastel', 'monochrome'].includes(parsed.colorTheme)) {
        return parsed.colorTheme as string;
      }
    } catch { /* ignore */ }
    return 'default';
  }, [jsonText]);

  // Docs panel toggle
  const [showDocs, setShowDocs] = useState(false);

  // First-time walkthrough
  const [walkthroughStep, setWalkthroughStep] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isVisible && !localStorage.getItem('injector_used')) {
      setWalkthroughStep(1);
    }
  }, [isVisible]);

  const dismissWalkthrough = useCallback(() => {
    setWalkthroughStep(null);
    try { localStorage.setItem('injector_used', '1'); } catch { /* ignore */ }
  }, []);

  const advanceWalkthrough = useCallback(() => {
    setWalkthroughStep((s) => {
      if (s === null) return null;
      if (s >= 3) {
        try { localStorage.setItem('injector_used', '1'); } catch { /* ignore */ }
        return null;
      }
      return s + 1;
    });
  }, []);

  // New state — history
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  // New state — quick inject
  const [quickType, setQuickType] = useState<QuickElementType | ''>('');
  const [quickFields, setQuickFields] = useState<Record<string, string>>({});
  const [quickSuccess, setQuickSuccess] = useState<string | null>(null);

  // AI description → JSON
  const [aiDescription, setAiDescription] = useState('');

  // Diff toast after injection
  const [diffToast, setDiffToast] = useState<string | null>(null);

  // Tracks previously-seen batch IDs for update detection
  const injectedBatchIdsRef = useRef<Set<string>>(new Set());

  // Build tab state
  const [buildType, setBuildType] = useState<BuildElementType | ''>('');
  const [buildFields, setBuildFields] = useState<Record<string, string>>({});
  const [buildElements, setBuildElements] = useState<DrawElement[]>([]);

  // Textarea ref for programmatic cursor manipulation
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Debounced preview: update the preview batch 300ms after the user stops typing
  const [previewBatch, setPreviewBatch] = useState<DrawBatch | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const parsed = JSON.parse(jsonText);
        const result = DrawBatchSchema.safeParse(parsed);
        if (result.success) {
          setPreviewBatch(result.data as DrawBatch);
        } else {
          setPreviewBatch(null);
        }
      } catch {
        setPreviewBatch(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [jsonText]);

  const filteredTemplates = useMemo(() => {
    return Object.entries(TEMPLATES).filter(
      ([, tpl]) => activeCategory === 'All' || tpl.category === activeCategory,
    );
  }, [activeCategory]);

  // ------- Format JSON handler -------
  const handleFormatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setFormatFeedback(true);
      setTimeout(() => setFormatFeedback(false), 1500);
    } catch {
      // Can't format invalid JSON — silently ignore
    }
  }, [jsonText]);

  // ------- Keyboard shortcut: Ctrl/Cmd+Shift+F to format -------
  useEffect(() => {
    if (!isVisible) return;
    function handleGlobalKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        handleFormatJson();
      }
    }
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [handleFormatJson, isVisible]);

  // ------- Textarea key handler: Tab, bracket auto-close, Ctrl+A -------
  const handleTextareaKeyDown = useCallback((e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;

    // Tab inserts 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const updated = val.substring(0, start) + '  ' + val.substring(end);
      setJsonText(updated);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
      return;
    }

    // Ctrl+A selects only textarea content
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      e.stopPropagation();
      ta.select();
      return;
    }

    // Auto-close brackets and quotes
    const closing = BRACKET_PAIRS[e.key];
    if (closing) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      // For quotes, skip if char after cursor is already a quote
      if (e.key === '"' && val[start] === '"') {
        e.preventDefault();
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
        return;
      }
      e.preventDefault();
      const selected = val.substring(start, end);
      const updated = val.substring(0, start) + e.key + selected + closing + val.substring(end);
      setJsonText(updated);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
    }
  }, []);

  // ------- Paste handler: auto-format JSON -------
  const handleTextareaPaste = useCallback((e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text/plain');
    try {
      const parsed = JSON.parse(pasted);
      e.preventDefault();
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch {
      // Not valid JSON — let default paste behavior work
    }
  }, []);

  // ------- Quick inject handler -------
  const handleQuickInject = useCallback(async () => {
    if (!quickType) return;
    const batch = buildQuickBatch(quickType, quickFields);
    clearError();
    setQuickSuccess(null);

    const result = await inject(batch);
    if (result) {
      onInject(result.batch);
      setQuickSuccess(`Added ${QUICK_ELEMENT_LABELS[quickType]}`);
      setTimeout(() => setQuickSuccess(null), 2000);
    }
  }, [quickType, quickFields, inject, onInject, clearError]);

  // Reset quick-inject fields when type changes
  useEffect(() => {
    if (!quickType) { setQuickFields({}); return; }
    const defaults: Record<string, string> = {};
    for (const f of QUICK_FIELDS[quickType]) defaults[f.key] = f.defaultValue;
    setQuickFields(defaults);
  }, [quickType]);

  // ------- AI description → JSON handler -------
  const handleAiGenerate = useCallback(() => {
    if (!aiDescription.trim()) return;
    const batch = generateBatchFromDescription(aiDescription);
    setJsonText(JSON.stringify(batch, null, 2));
    setTab('json');
  }, [aiDescription]);

  // ------- Build tab handlers -------
  useEffect(() => {
    if (!buildType) { setBuildFields({}); return; }
    const defaults: Record<string, string> = {};
    for (const f of BUILD_FIELDS[buildType]) defaults[f.key] = f.defaultValue;
    setBuildFields(defaults);
  }, [buildType]);

  const handleAddToBatch = useCallback(() => {
    if (!buildType) return;
    const el = buildElementFromFields(buildType, buildFields);
    const next = [...buildElements, el];
    setBuildElements(next);
    const batch: DrawBatch = {
      batch_id: `build-${Date.now().toString(36)}`,
      style_preset: 'clean_pen_sketch',
      elements: next,
    };
    setJsonText(JSON.stringify(batch, null, 2));
  }, [buildType, buildFields, buildElements]);

  const handleClearBatch = useCallback(() => {
    setBuildElements([]);
    setJsonText(DEFAULT_JSON);
  }, []);

  // Real-time Zod validation
  const parseResult = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText);
      const result = DrawBatchSchema.safeParse(parsed);
      if (result.success) {
        return { ok: true as const, data: result.data as DrawBatch, elementCount: (result.data as DrawBatch).elements?.length ?? 0 };
      }
      return {
        ok: false as const,
        errors: result.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
        rawIssues: result.error.issues,
      };
    } catch {
      return { ok: false as const, errors: ['Invalid JSON syntax'], rawIssues: [] as { path: (string | number)[]; message: string }[] };
    }
  }, [jsonText]);

  // Update inline errors on validation change
  useEffect(() => {
    setValidationErrors(parseResult.ok ? [] : parseResult.errors);
  }, [parseResult]);

  const copyErrorToClipboard = useCallback(() => {
    const errorPayload = {
      validationErrors: parseResult.ok ? [] : parseResult.errors,
      hookError: hookError ?? null,
      rawIssues: parseResult.ok ? [] : parseResult.rawIssues,
      inputPayload: (() => { try { return JSON.parse(jsonText); } catch { return jsonText; } })(),
    };
    void navigator.clipboard.writeText(JSON.stringify(errorPayload, null, 2)).then(() => {
      setCopiedError(true);
      setTimeout(() => setCopiedError(false), 2000);
    });
  }, [parseResult, hookError, jsonText]);

  const copyJsonToClipboard = useCallback(() => {
    void navigator.clipboard.writeText(jsonText).then(() => {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    });
  }, [jsonText]);

  // Rate-limit countdown timer
  useEffect(() => {
    if (!hookError) { setRetryCountdown(0); return; }
    const match = hookError.match(/(\d+)\s*(?:seconds?|s\b)/i) ?? hookError.match(/retry.*?(\d+)/i);
    if (!match || !(hookError.includes('rate') || hookError.includes('429'))) return;
    let remaining = parseInt(match[1], 10);
    if (remaining <= 0 || remaining > 120) return;
    setRetryCountdown(remaining);
    const interval = setInterval(() => {
      remaining -= 1;
      setRetryCountdown(remaining);
      if (remaining <= 0) { clearInterval(interval); clearError(); }
    }, 1000);
    return () => clearInterval(interval);
  }, [hookError, clearError]);

  const handleInject = useCallback(async () => {
    if (!parseResult.ok) return;
    clearError();
    setSuccessMsg(null);
    setDiffToast(null);

    const result = await inject(parseResult.data);
    if (result) {
      onInject(result.batch);
      // Save to history
      const firstType = result.batch.elements[0]?.type ?? 'unknown';
      saveToHistory(jsonText, result.diagnostics.elementCount, firstType);
      setHistory(loadHistory());

      // Diff toast: detect add vs update
      const bId = result.batch.batch_id;
      const count = result.diagnostics.elementCount;
      if (injectedBatchIdsRef.current.has(bId)) {
        setDiffToast(`~ ${count} updated`);
      } else {
        setDiffToast(`+ ${count} element${count !== 1 ? 's' : ''} added`);
      }
      injectedBatchIdsRef.current.add(bId);
      setTimeout(() => setDiffToast(null), 3000);

      setSuccessMsg(`Injected ${result.diagnostics.elementCount} elements`);
      // Auto-close after brief success display (desktop only)
      if (!forceOpen) {
        setTimeout(() => { setSuccessMsg(null); setOpen(false); }, 1500);
      } else {
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    }
  }, [parseResult, inject, onInject, clearError, forceOpen, jsonText]);

    const handleTemplateClick = useCallback(
    (key: string) => {
      const tpl = TEMPLATES[key];
      if (!tpl) return;
      const batch = { ...tpl.build(), source: 'template' as const };
      setJsonText(JSON.stringify(batch, null, 2));
      setTab('json');
      setSuccessMsg(null);
      clearError();
    },
    [clearError],
  );

  // ------- Keyboard shortcut: Ctrl/Cmd+Enter to validate + inject -------
  useEffect(() => {
    if (!isVisible) return;
    function handleInjectKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleInject();
      }
    }
    window.addEventListener('keydown', handleInjectKey);
    return () => window.removeEventListener('keydown', handleInjectKey);
  }, [handleInject, isVisible]);

  // On mobile with forceOpen, skip the FAB and render inline
  if (!isVisible) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open draw payload injector"
        className="absolute bottom-14 right-4 z-20 hidden h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)] shadow-[var(--shadow-card)] transition-all duration-200 hover:scale-105 hover:bg-[var(--color-accent-faint)] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] md:flex"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </button>
    );
  }

  // ----- Shared panel body (used for both desktop floating + mobile bottom sheet) -----
  const panelBody = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
              ⚡ Draw Injector
            </span>
            <span className="rounded-full bg-[var(--color-accent-faint)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-accent)]">
              v1
            </span>
            {parseResult.ok && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-faint)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
                {parseResult.elementCount} el{parseResult.elementCount !== 1 ? 's' : ''}
              </span>
            )}
            {parseResult.ok && !isInjecting && (
              <span className="text-[10px] font-medium text-green-600 dark:text-green-400">Ready ✓</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[var(--color-text-muted)]">
              Inject drawing payloads directly
            </span>
            <button
              type="button"
              onClick={() => setShowDocs((v) => !v)}
              className="text-[9px] font-medium text-[var(--color-accent)] transition-colors hover:underline"
            >
              {showDocs ? 'Hide Docs' : 'Docs'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowDocs((v) => !v)}
            aria-label="Toggle documentation"
            title="Documentation"
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-accent-faint)] hover:text-[var(--color-accent)]"
          >
            ?
          </button>
          {!forceOpen && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close injector"
              className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Docs panel (collapsible) */}
      {showDocs && (
        <div className="border-b border-[var(--color-border)]">
          <DrawingPayloadDocs onClose={() => setShowDocs(false)} />
        </div>
      )}

      {/* First-time walkthrough tooltip */}
      {walkthroughStep !== null && (
        <div className="relative border-b border-[var(--color-accent-soft)] bg-[var(--color-accent-faint)] px-3 py-2">
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-sm">💡</span>
            <div className="flex flex-1 flex-col gap-1">
              <p className="text-[10px] font-semibold text-[var(--color-accent)]">
                Getting Started — Step {walkthroughStep}/3
              </p>
              <p className="text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
                {walkthroughStep === 1 && 'Pick a template from the dropdown to get started quickly.'}
                {walkthroughStep === 2 && 'Edit the JSON to customize, or inject the template directly.'}
                {walkthroughStep === 3 && 'Click Inject to draw on the whiteboard — that\'s it!'}
              </p>
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={dismissWalkthrough}
              className="rounded px-2 py-0.5 text-[9px] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={advanceWalkthrough}
              className="rounded bg-[var(--color-accent)] px-2 py-0.5 text-[9px] font-medium text-white transition-colors hover:opacity-90"
            >
              {walkthroughStep >= 3 ? 'Done' : 'Next →'}
            </button>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-[var(--color-border)] px-3 py-1.5" role="tablist">
        {(['json', 'templates', 'history', 'build'] as const).map((t) => (
          <PillButton
            key={t}
            role="tab"
            aria-selected={tab === t}
            variant={tab === t ? 'accent' : 'default'}
            size="sm"
            onClick={() => setTab(t)}
          >
            {t === 'json' ? 'JSON' : t === 'templates' ? 'Templates' : t === 'build' ? 'Build' : `History (${history.length})`}
          </PillButton>
        ))}
      </div>

      {/* Tab content */}
      <div className="max-h-[40vh] overflow-y-auto p-3 md:max-h-[50vh]">
        {tab === 'json' && (
          <div className="flex flex-col gap-2">
            {/* Toolbar */}
            <div className="flex items-center justify-end gap-1.5">
              <label className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-text-secondary)]">
                Theme
                <select
                  value={currentTheme}
                  onChange={handleThemeChange}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)] outline-none transition hover:bg-[var(--color-surface)]"
                >
                  <option value="default">Default</option>
                  <option value="dark">Dark</option>
                  <option value="colorful">Colorful</option>
                  <option value="pastel">Pastel</option>
                  <option value="monochrome">Monochrome</option>
                </select>
              </label>
              <button
                type="button"
                onClick={handleFormatJson}
                title="Format JSON (Ctrl+Shift+F)"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface)]"
              >
                {formatFeedback ? 'Formatted ✓' : 'Format'}
              </button>
              <button
                type="button"
                onClick={copyJsonToClipboard}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface)]"
              >
                {copiedJson ? 'Copied ✓' : 'Copy JSON'}
              </button>
            </div>

            {/* Editor with line numbers */}
            <div className="relative flex overflow-hidden rounded-lg border border-[var(--color-border)] transition-colors focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent-soft)]">
              <div
                aria-hidden="true"
                className="pointer-events-none select-none border-r border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-2.5 font-mono text-xs leading-relaxed text-[var(--color-text-muted)]"
              >
                {jsonText.split('\n').map((_, i) => (
                  <div key={i} className="text-right">{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                aria-label="DrawBatch JSON"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                onPaste={handleTextareaPaste}
                spellCheck={false}
                rows={isMobile ? 6 : 12}
                className="w-full flex-1 resize-y bg-[var(--color-surface)] px-3 py-2.5 font-mono text-xs leading-relaxed text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
              />
            </div>

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/8 px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <p className="text-[11px] font-medium text-[var(--color-danger)]">
                      {validationErrors.length === 1 ? 'Validation error' : `${validationErrors.length} validation errors`}
                    </p>
                    {validationErrors.map((err, i) => (
                      <p key={i} className="font-mono text-[10px] leading-snug text-[var(--color-danger)]/80">
                        • {err}
                      </p>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copyErrorToClipboard}
                  className="self-end rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-danger)] opacity-70 transition-all hover:bg-[var(--color-danger)]/10 hover:opacity-100"
                >
                  {copiedError ? 'Copied ✓' : 'Copy error'}
                </button>
              </div>
            )}

            {/* Hook error (server / rate limit / network) */}
            {hookError && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-sm leading-none">⚠</span>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <p className="text-[11px] font-medium text-[var(--color-warning-text)]">
                      {hookError.includes('rate') || hookError.includes('429')
                        ? retryCountdown > 0
                          ? `Rate limit — please wait ${retryCountdown}s`
                          : 'Rate limit reached — please wait a moment'
                        : hookError.includes('fetch') || hookError.includes('network') || hookError.includes('Failed')
                          ? 'Network error — check your connection'
                          : 'Injection failed'}
                    </p>
                    <p className="font-mono text-[10px] leading-snug text-[var(--color-warning-text)]/80">{hookError}</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  {/* Retry button for server/network errors */}
                  {(hookError.includes('fetch') || hookError.includes('network') || hookError.includes('Failed') || hookError.includes('500') || hookError.includes('502') || hookError.includes('503')) && (
                    <button
                      type="button"
                      onClick={() => { clearError(); void handleInject(); }}
                      disabled={!parseResult.ok || isInjecting}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)] transition-all hover:bg-[var(--color-accent-faint)] disabled:opacity-50"
                    >
                      ↻ Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={copyErrorToClipboard}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-warning-text)] opacity-70 transition-all hover:bg-[var(--color-warning-bg)] hover:opacity-100"
                  >
                    {copiedError ? 'Copied ✓' : 'Copy error'}
                  </button>
                </div>
              </div>
            )}

            {/* Success */}
            {successMsg && (
              <div className="animate-success-flash flex items-center gap-2 rounded-lg border border-[var(--color-accent-soft)] bg-[var(--color-accent-faint)] px-2.5 py-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p className="text-[11px] font-medium text-[var(--color-accent)]">{successMsg}</p>
              </div>
            )}

            {/* Diff toast */}
            {diffToast && (
              <div
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-opacity duration-300"
                style={{
                  backgroundColor: diffToast.startsWith('+') ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                  border: `1px solid ${diffToast.startsWith('+') ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}`,
                }}
              >
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: diffToast.startsWith('+') ? '#16a34a' : '#ca8a04' }}
                >
                  {diffToast}
                </span>
              </div>
            )}

            {/* Mini preview */}
            {previewBatch ? (
              <MiniPreviewCanvas drawBatch={previewBatch} width={isMobile ? 280 : 352} height={200} />
            ) : validationErrors.length > 0 && jsonText.trim().length > 2 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold tracking-wide text-[var(--color-text-secondary)] uppercase">
                  Preview
                </p>
                <div
                  className="flex items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)]"
                  style={{ width: isMobile ? 280 : 352, height: 200 }}
                >
                  <span className="text-[11px] text-[var(--color-text-muted)]">Invalid JSON</span>
                </div>
              </div>
            ) : null}

            <PillButton
              variant="accent"
              onClick={handleInject}
              disabled={!parseResult.ok || isInjecting}
              aria-busy={isInjecting}
              aria-label={isInjecting ? 'Injection in progress' : 'Inject drawing payload'}
              className="self-end"
            >
              {isInjecting && (
                <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white" aria-hidden="true" />
              )}
              {isInjecting ? 'Injecting…' : 'Inject'}
            </PillButton>

            {/* ── AI-assisted JSON generation ── */}
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-border)] pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Describe to Generate
              </span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAiGenerate(); } }}
                  placeholder='e.g. "sin(x) from -π to π with axes"'
                  className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                />
                <PillButton
                  variant="accent"
                  size="sm"
                  onClick={handleAiGenerate}
                  disabled={!aiDescription.trim()}
                >
                  Generate
                </PillButton>
              </div>
              <p className="text-[9px] leading-snug text-[var(--color-text-muted)]">
                Keywords: sin/cos/tan, circle, axes, integral, normal, histogram, matrix, vector
              </p>
            </div>

            {/* ── Quick Inject ── */}
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-border)] pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Quick Inject
              </span>
              <select
                value={quickType}
                onChange={(e) => setQuickType(e.target.value as QuickElementType | '')}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">Add element type…</option>
                {QUICK_ELEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{QUICK_ELEMENT_LABELS[t]}</option>
                ))}
              </select>

              {quickType && (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_FIELDS[quickType].map((f) => (
                      <label key={f.key} className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-medium text-[var(--color-text-muted)]">{f.label}</span>
                        <input
                          type={f.type === 'color' ? 'color' : f.type === 'number' ? 'number' : 'text'}
                          value={quickFields[f.key] ?? f.defaultValue}
                          onChange={(e) => setQuickFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          className={`rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] ${f.type === 'color' ? 'h-7 w-full cursor-pointer p-0' : ''}`}
                        />
                      </label>
                    ))}
                  </div>
                  {quickType === 'function_curve' && (
                    <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1.5">
                      <p className="text-[9px] font-semibold text-[var(--color-text-muted)]">Supported functions</p>
                      <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--color-text-secondary)]">
                        sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, exp, log, ln, sqrt, abs, floor, ceil, round, sign, min(a,b), max(a,b), pow(a,b) · Constants: PI, E · Implicit multiplication: 2x, 2(x+1)
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <PillButton
                      variant="accent"
                      size="sm"
                      onClick={handleQuickInject}
                      disabled={isInjecting}
                    >
                      {quickType === 'function_curve' ? 'Plot' : 'Add to canvas'}
                    </PillButton>
                    {quickSuccess && (
                      <span className="text-[10px] font-medium text-green-600 dark:text-green-400">{quickSuccess} ✓</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'templates' && (
          <div className="flex flex-col gap-2">
            {/* Category filter pills */}
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Template category">
              {TEMPLATE_CATEGORIES.map((cat) => (
                <PillButton
                  key={cat}
                  role="radio"
                  aria-checked={activeCategory === cat}
                  variant={activeCategory === cat ? 'accent' : 'default'}
                  size="sm"
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </PillButton>
              ))}
            </div>

            {/* Template grid */}
            <div className="grid grid-cols-2 gap-2">
              {filteredTemplates.map(([key, tpl]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleTemplateClick(key)}
                  className="btn-press group flex flex-col gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2.5 text-left transition-all duration-150 hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-accent-faint)] hover:shadow-sm"
                >
                  <span className="text-xs font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-accent)]">
                    {tpl.label}
                  </span>
                  <span className="text-[10px] leading-tight text-[var(--color-text-muted)]">
                    {tpl.description}
                  </span>
                  <span className="mt-0.5 text-[9px] font-medium text-[var(--color-accent)]">
                    {tpl.category}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="flex flex-col gap-2">
            {history.length === 0 ? (
              <p className="py-4 text-center text-xs text-[var(--color-text-muted)]">
                No injection history yet. Injected payloads will appear here.
              </p>
            ) : (
              history.map((entry, i) => (
                <button
                  key={`${entry.timestamp}-${i}`}
                  type="button"
                  onClick={() => {
                    setJsonText(entry.json);
                    setTab('json');
                  }}
                  className="btn-press group flex flex-col gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2.5 text-left transition-all duration-150 hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-accent-faint)] hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-[var(--color-text-muted)]">
                      {new Date(entry.timestamp).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <span className="rounded-full bg-[var(--color-accent-faint)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-accent)]">
                      {entry.elementCount} el{entry.elementCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-accent)]">
                    {entry.firstType}
                  </span>
                  <span className="truncate font-mono text-[9px] text-[var(--color-text-muted)]">
                    {entry.json.substring(0, 80)}…
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'build' && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Build Batch — {buildElements.length} element{buildElements.length !== 1 ? 's' : ''}
            </span>

            {/* Element list */}
            {buildElements.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2">
                {buildElements.map((el, i) => (
                  <div key={el.id} className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--color-text-primary)]">
                      <span className="font-mono text-[var(--color-accent)]">{i + 1}.</span>{' '}
                      {el.type}
                      <span className="ml-1 text-[var(--color-text-muted)]">({el.id})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = buildElements.filter((_, j) => j !== i);
                        setBuildElements(next);
                        const batch: DrawBatch = {
                          batch_id: `build-${Date.now().toString(36)}`,
                          style_preset: 'clean_pen_sketch',
                          elements: next,
                        };
                        setJsonText(JSON.stringify(batch, null, 2));
                      }}
                      className="text-[9px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-danger)]"
                      aria-label={`Remove element ${i + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add element form */}
            <select
              value={buildType}
              onChange={(e) => setBuildType(e.target.value as BuildElementType | '')}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Add element…</option>
              {BUILD_ELEMENT_TYPES.map((t) => (
                <option key={t} value={t}>{BUILD_ELEMENT_LABELS[t]}</option>
              ))}
            </select>

            {buildType && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  {BUILD_FIELDS[buildType].map((f) => (
                    <label key={f.key} className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-medium text-[var(--color-text-muted)]">{f.label}</span>
                      <input
                        type={f.type === 'color' ? 'color' : f.type === 'number' ? 'number' : 'text'}
                        value={buildFields[f.key] ?? f.defaultValue}
                        onChange={(e) => setBuildFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className={`rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] ${f.type === 'color' ? 'h-7 w-full cursor-pointer p-0' : ''}`}
                      />
                    </label>
                  ))}
                </div>
                <PillButton
                  variant="accent"
                  size="sm"
                  onClick={handleAddToBatch}
                >
                  Add to batch
                </PillButton>
              </>
            )}

            <div className="flex items-center gap-2">
              <PillButton
                variant="default"
                size="sm"
                onClick={handleClearBatch}
                disabled={buildElements.length === 0}
              >
                Clear batch
              </PillButton>
              {buildElements.length > 0 && (
                <PillButton
                  variant="accent"
                  size="sm"
                  onClick={() => setTab('json')}
                >
                  Edit in JSON →
                </PillButton>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-2xl border-t border-[var(--color-border)] bg-[var(--color-panel)] shadow-lg backdrop-blur-md safe-bottom">
        {/* drag handle */}
        <div className="flex justify-center py-1.5">
          <div className="h-1 w-8 rounded-full bg-[var(--color-border)]" />
        </div>
        {panelBody}
      </div>
    );
  }

  // Desktop: floating panel
  return (
    <div className="animate-slide-up-in absolute bottom-14 right-4 z-20 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] shadow-[var(--shadow-soft)] backdrop-blur-xl">
      {panelBody}
    </div>
  );
});
