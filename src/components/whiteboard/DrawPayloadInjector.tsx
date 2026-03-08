'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { DrawBatchSchema } from '@/lib/schema';
import { useDrawInjector } from '@/hooks/useDrawInjector';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { DrawBatch, DrawElement } from '@/types/agent';
import { PillButton } from '@/components/ui/PillButton';

// ---------------------------------------------------------------------------
// Template categories & types
// ---------------------------------------------------------------------------

const TEMPLATE_CATEGORIES = ['All', 'Basic', 'Algebra', 'Calculus', 'Geometry', 'Linear Algebra'] as const;
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
};

type TabId = 'json' | 'templates';

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
  /** When true the panel is rendered open (controlled by MobilePanelSwitcher). */
  forceOpen?: boolean;
}

export const DrawPayloadInjector = memo(function DrawPayloadInjector({
  onInject,
  forceOpen,
}: DrawPayloadInjectorProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const isVisible = forceOpen ?? open;
  const [tab, setTab] = useState<TabId>('json');
  const [jsonText, setJsonText] = useState(DEFAULT_JSON);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('All');

  const { inject, isInjecting, error: hookError, clearError } = useDrawInjector();

  const filteredTemplates = useMemo(() => {
    return Object.entries(TEMPLATES).filter(
      ([, tpl]) => activeCategory === 'All' || tpl.category === activeCategory,
    );
  }, [activeCategory]);

  // Real-time Zod validation
  const parseResult = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText);
      const result = DrawBatchSchema.safeParse(parsed);
      if (result.success) {
        return { ok: true as const, data: result.data as DrawBatch };
      }
      return {
        ok: false as const,
        errors: result.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
      };
    } catch {
      return { ok: false as const, errors: ['Invalid JSON syntax'] };
    }
  }, [jsonText]);

  // Update inline errors on validation change
  useMemo(() => {
    setValidationErrors(parseResult.ok ? [] : parseResult.errors);
  }, [parseResult]);

  const handleInject = useCallback(async () => {
    if (!parseResult.ok) return;
    clearError();
    setSuccessMsg(null);

    const result = await inject(parseResult.data);
    if (result) {
      onInject(result.batch);
      setSuccessMsg(`Injected ${result.diagnostics.elementCount} elements`);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }, [parseResult, inject, onInject, clearError]);

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
        <span className="text-xs font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
          Draw Injector
        </span>
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

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-[var(--color-border)] px-3 py-1.5" role="tablist">
        {(['json', 'templates'] as const).map((t) => (
          <PillButton
            key={t}
            role="tab"
            aria-selected={tab === t}
            variant={tab === t ? 'accent' : 'default'}
            size="sm"
            onClick={() => setTab(t)}
          >
            {t === 'json' ? 'JSON' : 'Templates'}
          </PillButton>
        ))}
      </div>

      {/* Tab content */}
      <div className="max-h-[40vh] overflow-y-auto p-3 md:max-h-[50vh]">
        {tab === 'json' && (
          <div className="flex flex-col gap-2">
            <textarea
              aria-label="DrawBatch JSON"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              rows={isMobile ? 6 : 12}
              className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 font-mono text-xs leading-relaxed text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
            />

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="flex gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/8 px-2.5 py-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div className="flex flex-col gap-0.5">
                  {validationErrors.map((err, i) => (
                    <p key={i} className="font-mono text-[11px] leading-snug text-[var(--color-danger)]">
                      {err}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Hook error */}
            {hookError && (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-2.5 py-2">
                <span className="shrink-0 text-sm leading-none">⚠</span>
                <p className="text-[11px] leading-snug text-[var(--color-warning-text)]">{hookError}</p>
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

            <PillButton
              variant="accent"
              onClick={handleInject}
              disabled={!parseResult.ok || isInjecting}
              className="self-end"
            >
              {isInjecting ? 'Injecting…' : 'Inject'}
            </PillButton>
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
