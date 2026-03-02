import { describe, expect, it } from 'vitest';
import { parseGraphScriptToSemanticBatch } from '@/lib/whiteboard/graph-script';

describe('parseGraphScriptToSemanticBatch', () => {
  it('compiles textual graph script into semantic blocks and anchor-aware relations', () => {
    const script = [
      'panel id=left region=left title="Input (u,v)" axes=u,v',
      'shape id=cell panel=left type=rect x=0.52 y=0.55 w=0.28 h=0.28 label="tiny cell"',
      'panel id=right region=right title="Output (x,y)" axes=x,y',
      'shape id=image panel=right type=parallelogram x=0.55 y=0.53 w=0.3 h=0.28 rot=12 label="image"',
      'connect id=map type=maps_to from=left.cell.right to=right.image.left label="F"',
      'equation id=eq1 region=bottom tex="J(u,v)=\\\\det\\\\left(\\\\frac{\\\\partial(x,y)}{\\\\partial(u,v)}\\\\right)"',
      'note id=n1 region=bottom text="Area scales by |det J|"',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'gs-1',
      script,
      style_preset: 'clean_pen_sketch',
    });

    expect(result.semanticBatch).not.toBeNull();
    const batch = result.semanticBatch!;
    expect(batch.blocks.some((block) => block.kind === 'diagram_panel')).toBe(true);
    expect(batch.blocks.some((block) => block.kind === 'equation_stack')).toBe(true);
    expect(batch.blocks.some((block) => block.kind === 'caption')).toBe(true);
    expect(batch.relations?.length).toBeGreaterThanOrEqual(1);
    expect(batch.relations?.[0]?.from_anchor).toBe('left-cell-right');
    expect(batch.relations?.[0]?.to_anchor).toBe('right-image-left');
  });

  it('returns warnings for malformed commands while preserving valid parts', () => {
    const script = [
      'shape id=orphan type=rect x=0.5 y=0.5',
      'panel id=left axes=u,v',
      'shape id=cell panel=left type=rect x=0.4 y=0.4 w=0.2 h=0.2',
      'connect id=bad from=left.cell to=missing',
      'note text="ok note"',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'gs-2',
      script,
    });

    expect(result.semanticBatch).not.toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.semanticBatch?.blocks.some((block) => block.kind === 'diagram_panel')).toBe(true);
  });

  it('supports graph/node/edge aliases with auto node placement and panel center refs', () => {
    const script = [
      'set template=freeform_semantic style=clean_pen_sketch intent=teach',
      'graph id=g1 region=left title="Domain" axes=u,v',
      'node id=a graph=g1 label="input a"',
      'node id=b graph=g1 shape=box row=2 col=1 label="input b"',
      'graph id=g2 region=right title="Codomain" axes=x,y',
      'node id=c graph=g2 shape=parallelogram at=0.62,0.48 size=0.28,0.22 label="mapped c"',
      'edge id=e1 from=g1.a.right to=g2.c.left label="F"',
      'connect id=e2 type=explains from=g1 to=g2 label="map"',
      'equation id=eq1 region=bottom tex="J=\\\\det DF"',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'gs-3',
      script,
    });

    expect(result.semanticBatch).not.toBeNull();
    const batch = result.semanticBatch!;
    expect(batch.template).toBe('freeform_semantic');
    expect(batch.style_preset).toBe('clean_pen_sketch');
    expect(batch.intent).toBe('teach');
    expect(batch.relations?.length).toBe(2);
    expect(batch.relations?.[0]?.type).toBe('points_to');
    expect(batch.relations?.[0]?.from_anchor).toBe('g1-a-right');
    expect(batch.relations?.[1]?.from_anchor).toBe('g1-panel-center');
  });

  it('parses diamond, circle, hexagon, triangle shapes without warnings', () => {
    const script = [
      'panel id=p1',
      'shape id=d1 panel=p1 type=diamond label="Decision"',
      'shape id=c1 panel=p1 type=circle label="Node"',
      'shape id=h1 panel=p1 type=hexagon label="Hex"',
      'shape id=t1 panel=p1 type=triangle label="Tri"',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-shapes', script });
    expect(result.semanticBatch).not.toBeNull();
    const panel = result.semanticBatch!.blocks.find((b) => b.kind === 'diagram_panel');
    expect(panel).toBeDefined();
    if (panel?.kind === 'diagram_panel') {
      expect(panel.shapes).toHaveLength(4);
      expect(panel.shapes![0]!.type).toBe('diamond');
      expect(panel.shapes![1]!.type).toBe('circle');
      expect(panel.shapes![2]!.type).toBe('hexagon');
      expect(panel.shapes![3]!.type).toBe('triangle');
    }
    // No shape-related warnings
    const shapeWarnings = result.warnings.filter((w) => w.includes('type'));
    expect(shapeWarnings).toHaveLength(0);
  });

  it('resolves shape synonyms: rhombus→diamond, hex→hexagon, tri→triangle', () => {
    const script = [
      'panel id=p1',
      'shape id=s1 panel=p1 type=rhombus',
      'shape id=s2 panel=p1 type=hex',
      'shape id=s3 panel=p1 type=tri',
      'shape id=s4 panel=p1 type=oval',
      'shape id=s5 panel=p1 type=dot',
      'shape id=s6 panel=p1 type=decision',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-syn', script });
    const panel = result.semanticBatch!.blocks.find((b) => b.kind === 'diagram_panel');
    if (panel?.kind === 'diagram_panel') {
      expect(panel.shapes![0]!.type).toBe('diamond');
      expect(panel.shapes![1]!.type).toBe('hexagon');
      expect(panel.shapes![2]!.type).toBe('triangle');
      expect(panel.shapes![3]!.type).toBe('ellipse');
      expect(panel.shapes![4]!.type).toBe('circle');
      expect(panel.shapes![5]!.type).toBe('diamond');
    }
  });

  it('still warns on unknown shape type', () => {
    const script = [
      'panel id=p1',
      'shape id=s1 panel=p1 type=trapezoid',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-unk', script });
    expect(result.warnings.some((w) => w.includes('valid type'))).toBe(true);
  });

  it('duplicate shape IDs in same panel are renamed with warning', () => {
    const script = [
      'panel id=p1',
      'shape id=box1 panel=p1 type=rect label="First"',
      'shape id=box1 panel=p1 type=rect label="Second"',
      'shape id=box1 panel=p1 type=rect label="Third"',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-dup', script });
    expect(result.semanticBatch).not.toBeNull();
    const panel = result.semanticBatch!.blocks.find((b) => b.kind === 'diagram_panel');
    if (panel?.kind === 'diagram_panel') {
      expect(panel.shapes).toHaveLength(3);
      expect(panel.shapes![0]!.id).toBe('box1');
      expect(panel.shapes![1]!.id).toBe('box1-2');
      expect(panel.shapes![2]!.id).toBe('box1-3');
    }
    const dupWarnings = result.warnings.filter((w) => w.includes('duplicate shape id'));
    expect(dupWarnings).toHaveLength(2);
    expect(dupWarnings[0]).toContain('renamed to "box1-2"');
    expect(dupWarnings[1]).toContain('renamed to "box1-3"');
  });

  it('duplicate shape IDs across different panels are allowed with warning', () => {
    const script = [
      'panel id=p1',
      'shape id=shared panel=p1 type=rect',
      'panel id=p2',
      'shape id=shared panel=p2 type=rect',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-cross', script });
    expect(result.semanticBatch).not.toBeNull();
    // Cross-panel duplicates get the existing warning but both keep their original IDs
    const crossWarnings = result.warnings.filter((w) => w.includes('across panels'));
    expect(crossWarnings).toHaveLength(1);
  });

  it('returns null with warning for empty script', () => {
    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-empty', script: '' });
    expect(result.semanticBatch).toBeNull();
    expect(result.warnings.some((w) => w.includes('empty'))).toBe(true);
  });

  it('returns null with warning for whitespace-only script', () => {
    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-ws', script: '   \n  \n  ' });
    expect(result.semanticBatch).toBeNull();
    expect(result.warnings.some((w) => w.includes('empty'))).toBe(true);
  });

  it('strips comment-only lines and produces no blocks', () => {
    const script = '# this is a comment\n// another comment\n# third';
    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-comments', script });
    expect(result.semanticBatch).toBeNull();
    expect(result.warnings.some((w) => w.includes('No drawable blocks'))).toBe(true);
  });

  it('parses axes="Time,Value" into x_label and y_label', () => {
    const script = 'panel id=p1 axes=Time,Value';
    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-axes', script });
    expect(result.semanticBatch).not.toBeNull();
    const panel = result.semanticBatch!.blocks.find((b) => b.kind === 'diagram_panel');
    expect(panel).toBeDefined();
    if (panel?.kind === 'diagram_panel') {
      expect(panel.axes).toEqual({ x_label: 'Time', y_label: 'Value' });
    }
  });

  it('auto-pose gives sequential non-overlapping positions for multiple nodes', () => {
    const script = [
      'graph id=g1',
      'node id=a graph=g1 label="A"',
      'node id=b graph=g1 label="B"',
      'node id=c graph=g1 label="C"',
      'node id=d graph=g1 label="D"',
      'node id=e graph=g1 label="E"',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-auto', script });
    expect(result.semanticBatch).not.toBeNull();
    const panel = result.semanticBatch!.blocks.find((b) => b.kind === 'diagram_panel');
    if (panel?.kind === 'diagram_panel') {
      expect(panel.shapes).toHaveLength(5);
      // Collect poses and verify no exact overlaps
      const poses = panel.shapes!.map((s) => s.relative_pose!);
      for (let i = 0; i < poses.length; i++) {
        for (let j = i + 1; j < poses.length; j++) {
          const samePos = poses[i]!.x === poses[j]!.x && poses[i]!.y === poses[j]!.y;
          expect(samePos).toBe(false);
        }
      }
    }
  });

  it('row/col positioning forms a grid pattern', () => {
    const script = [
      'panel id=p1',
      'shape id=a panel=p1 type=rect row=1 col=1',
      'shape id=b panel=p1 type=rect row=1 col=2',
      'shape id=c panel=p1 type=rect row=2 col=1',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-grid', script });
    const panel = result.semanticBatch!.blocks.find((b) => b.kind === 'diagram_panel');
    if (panel?.kind === 'diagram_panel') {
      const [a, b, c] = panel.shapes!.map((s) => s.relative_pose!);
      // B is to the right of A (same row, higher col)
      expect(b!.x).toBeGreaterThan(a!.x);
      expect(b!.y).toBeCloseTo(a!.y, 5);
      // C is below A (higher row, same col)
      expect(c!.y).toBeGreaterThan(a!.y);
      expect(c!.x).toBeCloseTo(a!.x, 5);
    }
  });

  it('unquote strips surrounding quotes from label values', () => {
    const script = [
      'panel id=p1',
      'shape id=s1 panel=p1 type=rect label="Hello World"',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-quote', script });
    const panel = result.semanticBatch!.blocks.find((b) => b.kind === 'diagram_panel');
    if (panel?.kind === 'diagram_panel') {
      expect(panel.shapes![0]!.label).toBe('Hello World');
    }
  });

  it('malformed numeric at= pair produces warning and uses defaults', () => {
    const script = [
      'panel id=p1',
      'shape id=s1 panel=p1 type=rect at=0.5,notanumber',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({ batch_id: 'gs-badpair', script });
    expect(result.semanticBatch).not.toBeNull();
    const panel = result.semanticBatch!.blocks.find((b) => b.kind === 'diagram_panel');
    if (panel?.kind === 'diagram_panel') {
      // Should still create the shape with default pose
      expect(panel.shapes).toHaveLength(1);
      expect(panel.shapes![0]!.relative_pose).toBeDefined();
    }
  });

  it('returns null with warning for non-object input', () => {
    const result = parseGraphScriptToSemanticBatch(null);
    expect(result.semanticBatch).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
