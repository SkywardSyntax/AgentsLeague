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

  describe('degenerate numeric inputs', () => {
    it('clamps rotation_deg to [-360, 360]', () => {
      const script = [
        'panel id=p1 region=left',
        'shape id=s1 panel=p1 type=rect x=0.5 y=0.5 w=0.2 h=0.2 rot=99999',
      ].join('\n');

      const result = parseGraphScriptToSemanticBatch({ batch_id: 'rot-1', script });
      expect(result.semanticBatch).not.toBeNull();
      const panel = result.semanticBatch!.blocks.find(
        (b) => b.kind === 'diagram_panel',
      ) as { shapes: { relative_pose?: { rotation_deg?: number } }[] };
      expect(panel.shapes[0]!.relative_pose!.rotation_deg).toBe(360);
    });

    it('clamps negative rotation to -360', () => {
      const script = [
        'panel id=p1 region=left',
        'shape id=s1 panel=p1 type=rect x=0.5 y=0.5 rot=-999',
      ].join('\n');

      const result = parseGraphScriptToSemanticBatch({ batch_id: 'rot-2', script });
      const panel = result.semanticBatch!.blocks.find(
        (b) => b.kind === 'diagram_panel',
      ) as { shapes: { relative_pose?: { rotation_deg?: number } }[] };
      expect(panel.shapes[0]!.relative_pose!.rotation_deg).toBe(-360);
    });

    it('passes through valid rotation unchanged', () => {
      const script = [
        'panel id=p1 region=left',
        'shape id=s1 panel=p1 type=rect x=0.5 y=0.5 rot=45',
      ].join('\n');

      const result = parseGraphScriptToSemanticBatch({ batch_id: 'rot-3', script });
      const panel = result.semanticBatch!.blocks.find(
        (b) => b.kind === 'diagram_panel',
      ) as { shapes: { relative_pose?: { rotation_deg?: number } }[] };
      expect(panel.shapes[0]!.relative_pose!.rotation_deg).toBe(45);
    });

    it('rejects NaN/Infinity rotation via toNumber guard', () => {
      const script = [
        'panel id=p1 region=left',
        'shape id=s1 panel=p1 type=rect x=0.5 y=0.5 rot=Infinity',
      ].join('\n');

      const result = parseGraphScriptToSemanticBatch({ batch_id: 'rot-4', script });
      const panel = result.semanticBatch!.blocks.find(
        (b) => b.kind === 'diagram_panel',
      ) as { shapes: { relative_pose?: { rotation_deg?: number } }[] };
      // toNumber returns null for non-finite, so rotation_deg should be absent
      expect(panel.shapes[0]!.relative_pose!.rotation_deg).toBeUndefined();
    });

    it('truncates extremely long shape labels and emits warning', () => {
      const longLabel = 'A'.repeat(1000);
      const script = [
        'panel id=p1 region=left',
        `shape id=s1 panel=p1 type=rect x=0.5 y=0.5 label="${longLabel}"`,
      ].join('\n');

      const result = parseGraphScriptToSemanticBatch({ batch_id: 'label-1', script });
      expect(result.semanticBatch).not.toBeNull();
      const panel = result.semanticBatch!.blocks.find(
        (b) => b.kind === 'diagram_panel',
      ) as { shapes: { label?: string }[] };
      expect(panel.shapes[0]!.label!.length).toBe(500);
      expect(result.warnings.some((w) => w.includes('truncated'))).toBe(true);
    });

    it('does not truncate labels within limit', () => {
      const label = 'Normal label';
      const script = [
        'panel id=p1 region=left',
        `shape id=s1 panel=p1 type=rect x=0.5 y=0.5 label="${label}"`,
      ].join('\n');

      const result = parseGraphScriptToSemanticBatch({ batch_id: 'label-2', script });
      const panel = result.semanticBatch!.blocks.find(
        (b) => b.kind === 'diagram_panel',
      ) as { shapes: { label?: string }[] };
      expect(panel.shapes[0]!.label).toBe(label);
      expect(result.warnings.some((w) => w.includes('truncated'))).toBe(false);
    });

    it('truncates long caption text and emits warning', () => {
      const longText = 'B'.repeat(800);
      const script = [
        'panel id=p1 region=left',
        `caption id=c1 text="${longText}"`,
      ].join('\n');

      const result = parseGraphScriptToSemanticBatch({ batch_id: 'cap-1', script });
      expect(result.semanticBatch).not.toBeNull();
      const caption = result.semanticBatch!.blocks.find(
        (b) => b.kind === 'caption',
      ) as { text: string };
      expect(caption.text.length).toBe(500);
      expect(result.warnings.some((w) => w.includes('truncated'))).toBe(true);
    });

    it('rejects NaN position values via existing toNumber guard', () => {
      const script = [
        'panel id=p1 region=left',
        'shape id=s1 panel=p1 type=rect x=NaN y=NaN',
      ].join('\n');

      const result = parseGraphScriptToSemanticBatch({ batch_id: 'nan-1', script });
      expect(result.semanticBatch).not.toBeNull();
      const panel = result.semanticBatch!.blocks.find(
        (b) => b.kind === 'diagram_panel',
      ) as { shapes: { relative_pose?: { x: number; y: number } }[] };
      // NaN rejected by toNumber → falls back to defaults, which are clamped [0,1]
      const pose = panel.shapes[0]!.relative_pose!;
      expect(Number.isFinite(pose.x)).toBe(true);
      expect(Number.isFinite(pose.y)).toBe(true);
    });
  });
});
