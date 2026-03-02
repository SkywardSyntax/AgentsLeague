import { describe, expect, it } from 'vitest';
import { parseGraphScriptToSemanticBatch } from '@/lib/whiteboard/graph-script';

/**
 * These tests exercise graph-script parser internals (stripComments, tokenize,
 * parseLine, parseAnchorRef, parseShapePose) through the public API with
 * targeted inputs designed to hit each parser path.
 */

describe('graph-script parser: stripComments behavior', () => {
  it('strips // comments outside quotes', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'sc-1',
      script: 'panel id=p1 // this is a comment\nshape id=s1 panel=p1 type=rect label="visible"',
    });
    expect(result.semanticBatch).not.toBeNull();
    const panel = result.semanticBatch!.blocks.find(b => b.kind === 'diagram_panel');
    expect(panel).toBeDefined();
  });

  it('strips # comments', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'sc-2',
      script: 'panel id=p1 # hash comment\nshape id=s1 panel=p1 type=rect',
    });
    expect(result.semanticBatch).not.toBeNull();
  });

  it('preserves // inside quoted strings', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'sc-3',
      script: 'panel id=p1\nshape id=s1 panel=p1 type=rect label="url://host"',
    });
    expect(result.semanticBatch).not.toBeNull();
    const panel = result.semanticBatch!.blocks.find(
      (b): b is Extract<typeof b, { kind: 'diagram_panel' }> => b.kind === 'diagram_panel',
    );
    expect(panel?.shapes?.[0]?.label).toBe('url://host');
  });

  it('handles empty/comment-only lines gracefully', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'sc-4',
      script: '// only a comment\n# another\n\npanel id=p1\nshape id=s1 panel=p1 type=rect',
    });
    expect(result.semanticBatch).not.toBeNull();
  });
});

describe('graph-script parser: tokenize behavior', () => {
  it('handles quoted strings with escaped quotes', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'tk-1',
      script: 'panel id=p1\nshape id=s1 panel=p1 type=rect label="he said \\"hi\\""',
    });
    expect(result.semanticBatch).not.toBeNull();
    const panel = result.semanticBatch!.blocks.find(
      (b): b is Extract<typeof b, { kind: 'diagram_panel' }> => b.kind === 'diagram_panel',
    );
    expect(panel?.shapes?.[0]?.label).toBe('he said "hi"');
  });

  it('handles multiple tokens separated by whitespace', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'tk-2',
      script: 'panel id=p1   title="My Panel"\nshape id=s1 panel=p1 type=rect',
    });
    const panel = result.semanticBatch!.blocks.find(
      (b): b is Extract<typeof b, { kind: 'diagram_panel' }> => b.kind === 'diagram_panel',
    );
    expect(panel?.title).toBe('My Panel');
  });

  it('handles empty script', () => {
    const result = parseGraphScriptToSemanticBatch({ batch_id: 'tk-3', script: '' });
    expect(result.semanticBatch).toBeNull();
  });
});

describe('graph-script parser: parseLine behavior', () => {
  it('parses key=value tokens', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'pl-1',
      script: 'panel id=myPanel region=left title="Test Panel"',
    });
    expect(result.semanticBatch).not.toBeNull();
    const panel = result.semanticBatch!.blocks.find(
      (b): b is Extract<typeof b, { kind: 'diagram_panel' }> => b.kind === 'diagram_panel',
    );
    expect(panel?.id).toBe('myPanel');
    expect(panel?.title).toBe('Test Panel');
  });

  it('treats tokens without = as positional args', () => {
    // "node p1 s1 rect" → command=node, positional=[p1, s1, rect]
    // This tests that no-= tokens become positional args, not errors
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'pl-2',
      script: 'graph g1\nnode g1 myNode rect label="test"',
    });
    expect(result.semanticBatch).not.toBeNull();
    const panel = result.semanticBatch!.blocks.find(
      (b): b is Extract<typeof b, { kind: 'diagram_panel' }> => b.kind === 'diagram_panel',
    );
    expect(panel?.shapes?.length).toBeGreaterThanOrEqual(1);
  });

  it('returns warning for unsupported command', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'pl-3',
      script: 'panel id=p1\nshape id=s1 panel=p1 type=rect\nfoobar x=1',
    });
    expect(result.warnings.some(w => w.includes('foobar'))).toBe(true);
  });
});

describe('graph-script parser: parseAnchorRef behavior', () => {
  it('resolves three-part anchor ref (panel.shape.anchor)', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'ar-1',
      script: [
        'panel id=p1',
        'shape id=s1 panel=p1 type=rect',
        'panel id=p2',
        'shape id=s2 panel=p2 type=rect',
        'connect from=p1.s1.right to=p2.s2.left',
      ].join('\n'),
    });
    expect(result.semanticBatch?.relations?.[0]?.from_anchor).toBe('p1-s1-right');
    expect(result.semanticBatch?.relations?.[0]?.to_anchor).toBe('p2-s2-left');
  });

  it('resolves panel-only reference to panel-center', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'ar-2',
      script: [
        'panel id=p1',
        'panel id=p2',
        'connect from=p1 to=p2',
      ].join('\n'),
    });
    expect(result.semanticBatch?.relations?.[0]?.from_anchor).toBe('p1-panel-center');
    expect(result.semanticBatch?.relations?.[0]?.to_anchor).toBe('p2-panel-center');
  });

  it('resolves two-part ref (shape.anchor) with fallback panel', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'ar-3',
      script: [
        'panel id=p1',
        'shape id=s1 panel=p1 type=rect',
        'shape id=s2 panel=p1 type=rect',
        'connect panel=p1 from=s1.right to=s2.left',
      ].join('\n'),
    });
    expect(result.semanticBatch?.relations?.[0]?.from_anchor).toBe('p1-s1-right');
    expect(result.semanticBatch?.relations?.[0]?.to_anchor).toBe('p1-s2-left');
  });

  it('warns when anchor refs cannot be resolved', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'ar-4',
      script: 'panel id=p1\nconnect from=nonexistent to=alsoNot',
    });
    expect(result.warnings.some(w => w.includes('resolvable'))).toBe(true);
  });

  it('normalizes anchor aliases (c→center, nw→top-left)', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'ar-5',
      script: [
        'panel id=p1',
        'shape id=s1 panel=p1 type=rect',
        'panel id=p2',
        'shape id=s2 panel=p2 type=rect',
        'connect from=p1.s1.nw to=p2.s2.c',
      ].join('\n'),
    });
    expect(result.semanticBatch?.relations?.[0]?.from_anchor).toBe('p1-s1-top-left');
    expect(result.semanticBatch?.relations?.[0]?.to_anchor).toBe('p2-s2-center');
  });
});

describe('graph-script parser: parseShapePose behavior', () => {
  it('uses explicit x/y coordinates', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'sp-1',
      script: 'panel id=p1\nshape id=s1 panel=p1 type=rect x=0.3 y=0.7 w=0.2 h=0.1',
    });
    const panel = result.semanticBatch!.blocks.find(
      (b): b is Extract<typeof b, { kind: 'diagram_panel' }> => b.kind === 'diagram_panel',
    );
    const pose = panel?.shapes?.[0]?.relative_pose;
    expect(pose?.x).toBeCloseTo(0.3);
    expect(pose?.y).toBeCloseTo(0.7);
    expect(pose?.w).toBeCloseTo(0.2);
    expect(pose?.h).toBeCloseTo(0.1);
  });

  it('clamps row/col to [0, 12]', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'sp-2',
      script: 'panel id=p1\nnode id=n1 panel=p1 row=99 col=99',
    });
    const panel = result.semanticBatch!.blocks.find(
      (b): b is Extract<typeof b, { kind: 'diagram_panel' }> => b.kind === 'diagram_panel',
    );
    const pose = panel?.shapes?.[0]?.relative_pose;
    // row/col are clamped to 12 (0-indexed → 12), then pose coords are clamped to [0,1]
    expect(pose?.x).toBeLessThanOrEqual(1);
    expect(pose?.y).toBeLessThanOrEqual(1);
  });

  it('falls back to auto-pose for node command', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'sp-3',
      script: 'panel id=p1\nnode id=n1 panel=p1\nnode id=n2 panel=p1',
    });
    const panel = result.semanticBatch!.blocks.find(
      (b): b is Extract<typeof b, { kind: 'diagram_panel' }> => b.kind === 'diagram_panel',
    );
    const pose1 = panel?.shapes?.[0]?.relative_pose;
    const pose2 = panel?.shapes?.[1]?.relative_pose;
    // Auto-poses should be different for different node indices
    expect(pose1?.x).not.toBe(pose2?.x);
  });

  it('supports at=x,y shorthand', () => {
    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'sp-4',
      script: 'panel id=p1\nshape id=s1 panel=p1 type=rect at=0.4,0.6',
    });
    const panel = result.semanticBatch!.blocks.find(
      (b): b is Extract<typeof b, { kind: 'diagram_panel' }> => b.kind === 'diagram_panel',
    );
    const pose = panel?.shapes?.[0]?.relative_pose;
    expect(pose?.x).toBeCloseTo(0.4);
    expect(pose?.y).toBeCloseTo(0.6);
  });
});
