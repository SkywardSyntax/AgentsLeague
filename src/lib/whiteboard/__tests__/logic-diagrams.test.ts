import { describe, it, expect } from 'vitest';
import { lowerMathPrimitive } from '../planner/lowerer';
import type {
  VennDiagramElement,
  TruthTableElement,
} from '@/types/agent';

// ---------------------------------------------------------------------------
// venn_diagram tests
// ---------------------------------------------------------------------------
describe('expandVennDiagram (via lowerMathPrimitive)', () => {
  function makeVenn(overrides: Partial<VennDiagramElement> = {}): VennDiagramElement {
    return {
      id: 'venn1',
      type: 'venn_diagram',
      x: 400,
      y: 300,
      sets: [{ label: 'A' }, { label: 'B' }],
      ...overrides,
    };
  }

  it('2-set → expands to 2 ellipses + text labels', () => {
    const el = makeVenn();
    const out = lowerMathPrimitive(el);
    const ellipses = out.filter((e) => e.type === 'ellipse');
    expect(ellipses).toHaveLength(2);
    const texts = out.filter((e) => e.type === 'text');
    expect(texts.length).toBeGreaterThanOrEqual(2);
  });

  it('2-set with intersectionLabel → includes intersection text', () => {
    const el = makeVenn({ intersectionLabel: 'A∩B' });
    const out = lowerMathPrimitive(el);
    const intersectionText = out.find(
      (e) => e.type === 'text' && e.id.includes('-intersection'),
    );
    expect(intersectionText).toBeDefined();
  });

  it('3-set → 3 ellipses', () => {
    const el = makeVenn({
      sets: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
    });
    const out = lowerMathPrimitive(el);
    const ellipses = out.filter((e) => e.type === 'ellipse');
    expect(ellipses).toHaveLength(3);
  });

  it('3-set → labels for each set', () => {
    const el = makeVenn({
      sets: [{ label: 'X' }, { label: 'Y' }, { label: 'Z' }],
    });
    const out = lowerMathPrimitive(el);
    const texts = out.filter((e) => e.type === 'text');
    expect(texts.length).toBeGreaterThanOrEqual(3);
  });

  it('with title → includes title text element', () => {
    const el = makeVenn({ title: 'Set Operations' });
    const out = lowerMathPrimitive(el);
    const title = out.find((e) => e.type === 'text' && e.id.includes('-title'));
    expect(title).toBeDefined();
  });

  it('all coordinates are finite', () => {
    const el = makeVenn({ sets: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] });
    const out = lowerMathPrimitive(el);
    for (const e of out) {
      if (e.type === 'ellipse') {
        expect(Number.isFinite(e.cx)).toBe(true);
        expect(Number.isFinite(e.cy)).toBe(true);
      }
      if (e.type === 'text') {
        expect(Number.isFinite(e.x)).toBe(true);
        expect(Number.isFinite(e.y)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// truth_table tests
// ---------------------------------------------------------------------------
describe('expandTruthTable (via lowerMathPrimitive)', () => {
  function makeTable(overrides: Partial<TruthTableElement> = {}): TruthTableElement {
    return {
      id: 'tt1',
      type: 'truth_table',
      x: 100,
      y: 100,
      variables: ['P', 'Q'],
      outputs: ['P∧Q'],
      ...overrides,
    };
  }

  it('P,Q → 4 data rows of T/F text', () => {
    const el = makeTable();
    const out = lowerMathPrimitive(el);
    // Each row has cells for variable columns; look for T/F text elements
    const tfTexts = out.filter(
      (e) => e.type === 'text' && (e.id.match(/-r\d+-c\d+$/)),
    );
    // 4 rows × 2 variable columns (P, Q) = 8 T/F cells
    expect(tfTexts).toHaveLength(8);
  });

  it('P,Q,R → 8 data rows', () => {
    const el = makeTable({
      variables: ['P', 'Q', 'R'],
      outputs: ['P∧Q∧R'],
    });
    const out = lowerMathPrimitive(el);
    const tfTexts = out.filter(
      (e) => e.type === 'text' && (e.id.match(/-r\d+-c\d+$/)),
    );
    // 8 rows × 3 variable columns = 24
    expect(tfTexts).toHaveLength(24);
  });

  it('generates correct T/F pattern for 2 variables', () => {
    const el = makeTable({ variables: ['P', 'Q'], outputs: [] });
    const out = lowerMathPrimitive(el);
    // Extract T/F values for the first variable column (P)
    const pValues: string[] = [];
    for (let r = 0; r < 4; r++) {
      const cell = out.find((e) => e.type === 'text' && e.id === `tt1-r${r}-c0`);
      if (cell && cell.type === 'text') pValues.push(cell.text);
    }
    // Canonical order: FF, FT, TF, TT → P column is F,F,T,T
    expect(pValues).toEqual(['F', 'F', 'T', 'T']);
  });

  it('includes header labels', () => {
    const el = makeTable();
    const out = lowerMathPrimitive(el);
    const headers = out.filter(
      (e) => e.type === 'text' && e.id.startsWith('tt1-hdr-'),
    );
    // 3 headers: P, Q, P∧Q
    expect(headers).toHaveLength(3);
  });

  it('includes grid lines', () => {
    const el = makeTable();
    const out = lowerMathPrimitive(el);
    const lines = out.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('all coordinates are finite', () => {
    const el = makeTable();
    const out = lowerMathPrimitive(el);
    for (const e of out) {
      if (e.type === 'text') {
        expect(Number.isFinite(e.x)).toBe(true);
        expect(Number.isFinite(e.y)).toBe(true);
      }
      if (e.type === 'rect') {
        expect(Number.isFinite(e.x)).toBe(true);
        expect(Number.isFinite(e.y)).toBe(true);
      }
      if (e.type === 'line') {
        expect(Number.isFinite(e.from.x)).toBe(true);
        expect(Number.isFinite(e.to.y)).toBe(true);
      }
    }
  });
});
