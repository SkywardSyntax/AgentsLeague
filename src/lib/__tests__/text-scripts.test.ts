import { describe, expect, it } from 'vitest';
import { parseTextScripts } from '@/lib/latex/text-scripts';

describe('parseTextScripts', () => {
  it('converts caret and underscore scripts into tokens', () => {
    const tokens = parseTextScripts('x^2 + a_{ij} + y_0');
    expect(tokens).toEqual([
      { kind: 'text', value: 'x' },
      { kind: 'sup', value: '2' },
      { kind: 'text', value: ' + a' },
      { kind: 'sub', value: 'ij' },
      { kind: 'text', value: ' + y' },
      { kind: 'sub', value: '0' },
    ]);
  });

  it('respects escaped script markers', () => {
    const tokens = parseTextScripts('literal \\^2 and \\_x');
    expect(tokens).toEqual([{ kind: 'text', value: 'literal ^2 and _x' }]);
  });
});

