import { describe, expect, it } from 'vitest';
import { parseGraphScriptToSemanticBatch } from '@/lib/whiteboard/graph-script';

describe('parseGraphScriptToSemanticBatch – negative inputs', () => {
  it('non-object input returns null with warning', () => {
    const result = parseGraphScriptToSemanticBatch(42);
    expect(result.semanticBatch).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('empty script returns null with warning', () => {
    const result = parseGraphScriptToSemanticBatch({ script: '' });
    expect(result.semanticBatch).toBeNull();
    expect(result.warnings).toContain('Graph script is empty');
  });

  it('script with only comments and whitespace returns null', () => {
    const result = parseGraphScriptToSemanticBatch({
      script: '# just a comment\n\n   \n# another',
    });
    expect(result.semanticBatch).toBeNull();
  });

  it('unknown command produces warning but does not crash', () => {
    const result = parseGraphScriptToSemanticBatch({
      script: 'set template=freeform_semantic\nxyz foo=bar',
    });
    expect(
      result.warnings.some(
        (w) => w.toLowerCase().includes('unsupported') || w.toLowerCase().includes('unknown'),
      ),
    ).toBe(true);
  });

  it('panel without required id produces warning', () => {
    const result = parseGraphScriptToSemanticBatch({
      script: 'set template=freeform_semantic\npanel',
    });
    expect(
      result.warnings.some((w) => w.toLowerCase().includes('requires id')),
    ).toBe(true);
  });
});
