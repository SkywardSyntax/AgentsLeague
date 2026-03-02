import { describe, expect, it } from 'vitest';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import type { DrawBatch } from '@/types/agent';

describe('semantic latex compilation', () => {
  it(
    'compiles over-escaped latex without warnings',
    async () => {
      const batch: DrawBatch = {
        batch_id: 'b1',
        elements: [
          {
            id: 'eq1',
            type: 'latex',
            x: 80,
            y: 100,
            tex: 'x=\\\\frac{1}{2}',
          },
        ],
      };

      const result = await compileBatchToStrokes(batch);
      expect(result.warnings).toHaveLength(0);
      expect(result.strokes.length).toBeGreaterThan(0);
    },
    20_000,
  );

  it(
    'compiles quadratic derivation latex batch without fallback warnings',
    async () => {
      const batch: DrawBatch = {
        batch_id: 'b2',
        elements: [
          {
            id: 'eq4',
            type: 'latex',
            x: 60,
            y: 300,
            tex: '\\left(x+\\frac{b}{2a}\\right)^2=\\frac{b^2-4ac}{4a^2}',
          },
          {
            id: 'eq5',
            type: 'latex',
            x: 60,
            y: 350,
            tex: 'x+\\frac{b}{2a}=\\pm\\frac{\\sqrt{b^2-4ac}}{2a}',
          },
          {
            id: 'eq6',
            type: 'latex',
            x: 60,
            y: 400,
            tex: '\\boxed{\\;x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\\;}',
          },
        ],
      };

      const result = await compileBatchToStrokes(batch);
      expect(result.warnings).toHaveLength(0);
      expect(result.strokes.length).toBeGreaterThan(0);
    },
    20_000,
  );

  it(
    'compiles mixed prose and inline latex in text elements without fallback warnings',
    async () => {
      const batch: DrawBatch = {
        batch_id: 'b3',
        elements: [
          {
            id: 't1',
            type: 'text',
            x: 60,
            y: 120,
            text: 'Start with the general quadratic (with a\\neq 0):',
            size: 18,
          },
          {
            id: 't2',
            type: 'text',
            x: 60,
            y: 160,
            text: 'x^2+\\frac{b}{a}x+\\frac{c}{a}=0',
            size: 18,
          },
          {
            id: 't3',
            type: 'text',
            x: 60,
            y: 200,
            text: 'Take half the coefficient, \\frac{b}{2a}, then square it.',
            size: 18,
          },
        ],
      };

      const result = await compileBatchToStrokes(batch);
      expect(result.warnings).toHaveLength(0);
      expect(result.strokes.length).toBeGreaterThan(0);
    },
    20_000,
  );

  it(
    'auto-resolves vertical collisions between text and latex elements in sequence',
    async () => {
      const batch: DrawBatch = {
        batch_id: 'b4',
        elements: [
          { id: 't1', type: 'text', x: 60, y: 110, text: '1) Divide by a', size: 18 },
          {
            id: 'eq1',
            type: 'latex',
            x: 60,
            y: 128,
            tex: 'x^2+\\frac{b}{a}x+\\frac{c}{a}=0',
            displayMode: true,
            fontSize: 20,
          },
          { id: 't2', type: 'text', x: 60, y: 142, text: '2) Move constant term', size: 18 },
        ],
      };

      const result = await compileBatchToStrokes(batch);
      expect(result.warnings).toHaveLength(0);

      const eq = result.strokes.filter((stroke) => stroke.elementId === 'eq1');
      const next = result.strokes.filter((stroke) => stroke.elementId.startsWith('t2'));
      expect(eq.length).toBeGreaterThan(0);
      expect(next.length).toBeGreaterThan(0);

      const eqMaxY = Math.max(...eq.flatMap((stroke) => stroke.points.map((p) => p.y)));
      const nextMinY = Math.min(...next.flatMap((stroke) => stroke.points.map((p) => p.y)));
      expect(nextMinY - eqMaxY).toBeGreaterThanOrEqual(8);
    },
    20_000,
  );

  it(
    'keeps stacked fraction lines from overlapping inside a single text element',
    async () => {
      const batch: DrawBatch = {
        batch_id: 'b5',
        elements: [
          {
            id: 't1',
            type: 'text',
            x: 60,
            y: 180,
            size: 20,
            text: 'x+\\frac{b}{2a}=\\pm\\frac{\\sqrt{b^2-4ac}}{2a}\nx=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}',
          },
        ],
      };

      const result = await compileBatchToStrokes(batch);
      expect(result.warnings).toHaveLength(0);

      const first = result.strokes.filter((stroke) => stroke.elementId.startsWith('t1-seg-0-latex'));
      const second = result.strokes.filter((stroke) => stroke.elementId.startsWith('t1-seg-2-latex'));

      expect(first.length).toBeGreaterThan(0);
      expect(second.length).toBeGreaterThan(0);

      const firstMaxY = Math.max(...first.flatMap((stroke) => stroke.points.map((p) => p.y)));
      const secondMinY = Math.min(...second.flatMap((stroke) => stroke.points.map((p) => p.y)));
      expect(secondMinY - firstMaxY).toBeGreaterThanOrEqual(10);
    },
    20_000,
  );

  it(
    'treats inline caret scripts in prose as latex instead of text accents',
    async () => {
      const batch: DrawBatch = {
        batch_id: 'b6',
        elements: [
          {
            id: 't1',
            type: 'text',
            x: 60,
            y: 120,
            size: 20,
            text: 'Solve for u^3 and v^3',
          },
        ],
      };

      const result = await compileBatchToStrokes(batch);
      expect(result.warnings).toHaveLength(0);
      expect(result.strokes.some((stroke) => stroke.elementId.includes('-latex'))).toBe(true);
    },
    20_000,
  );

  it(
    'keeps mixed prose+inline-math lines vertically separated when stacked',
    async () => {
      const batch: DrawBatch = {
        batch_id: 'b7',
        elements: [
          {
            id: 't1',
            type: 'text',
            x: 70,
            y: 140,
            size: 20,
            text: 'Tangent vectors: F_u=(x_u,y_u), F_v=(x_v,y_v)\nArea scaling: \\Delta A_{xy}\\approx |\\det J|\\Delta u\\Delta v',
          },
        ],
      };

      const result = await compileBatchToStrokes(batch);
      expect(result.warnings).toHaveLength(0);

      const lineBands = new Map<number, { minY: number; maxY: number }>();
      for (const stroke of result.strokes) {
        const match = stroke.elementId.match(/-ln-(\d+)$/);
        if (!match) continue;
        const lineNo = Number(match[1]);
        if (!Number.isFinite(lineNo)) continue;
        const ys = stroke.points.map((p) => p.y);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const prev = lineBands.get(lineNo);
        if (!prev) {
          lineBands.set(lineNo, { minY, maxY });
        } else {
          prev.minY = Math.min(prev.minY, minY);
          prev.maxY = Math.max(prev.maxY, maxY);
        }
      }

      const ordered = [...lineBands.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, band]) => band);

      expect(ordered.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i]!.minY - ordered[i - 1]!.maxY).toBeGreaterThanOrEqual(10);
      }
    },
    20_000,
  );

  it(
    'truncates text elements exceeding 50 lines with warning',
    async () => {
      const manyLines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
      const batch: DrawBatch = {
        batch_id: 'trunc',
        elements: [
          { id: 'big', type: 'text', x: 10, y: 10, text: manyLines, size: 14 },
        ],
      };

      const result = await compileBatchToStrokes(batch);
      expect(result.warnings).toContain('Text element big truncated from 200 to 50 lines');

      const lineIndices = new Set<number>();
      for (const stroke of result.strokes) {
        const match = stroke.elementId.match(/-ln-(\d+)$/);
        if (match) lineIndices.add(Number(match[1]));
      }
      expect(Math.max(...lineIndices) + 1).toBeLessThanOrEqual(50);
    },
    30_000,
  );

  it(
    'normalizeTextVerticalSpacing handles 80+ text groups without quadratic blowup',
    async () => {
      const elements = Array.from({ length: 80 }, (_, i) => ({
        id: `t${i}`,
        type: 'text' as const,
        x: 60,
        y: 100 + i * 2,
        text: `Group ${i}`,
        size: 14,
      }));
      const batch: DrawBatch = { batch_id: 'perf', elements };

      const start = performance.now();
      const result = await compileBatchToStrokes(batch);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5000);
      expect(result.strokes.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
