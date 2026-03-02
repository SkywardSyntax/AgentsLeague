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

  it('parses braced subscript', () => {
    const tokens = parseTextScripts('x_{10}');
    expect(tokens).toEqual([
      { kind: 'text', value: 'x' },
      { kind: 'sub', value: '10' },
    ]);
  });

  it('parses nested braces in superscript', () => {
    const tokens = parseTextScripts('x^{a{b}c}');
    expect(tokens).toEqual([
      { kind: 'text', value: 'x' },
      { kind: 'sup', value: 'a{b}c' },
    ]);
  });

  it('treats unclosed brace as literal text', () => {
    const tokens = parseTextScripts('x^{abc');
    expect(tokens).toEqual([{ kind: 'text', value: 'x^{abc' }]);
  });

  it('treats caret at end of string as literal text', () => {
    const tokens = parseTextScripts('x^');
    expect(tokens).toEqual([{ kind: 'text', value: 'x^' }]);
  });

  it('handles double backslash before caret (second backslash escapes caret)', () => {
    // Two actual backslashes followed by ^2: the second \ escapes ^
    const tokens = parseTextScripts('x\\\\^2');
    expect(tokens).toEqual([{ kind: 'text', value: 'x\\^2' }]);
  });

  it('parses mixed sequential scripts', () => {
    const tokens = parseTextScripts('x_1^2');
    expect(tokens).toEqual([
      { kind: 'text', value: 'x' },
      { kind: 'sub', value: '1' },
      { kind: 'sup', value: '2' },
    ]);
  });

  it('handles empty braces in superscript', () => {
    const tokens = parseTextScripts('x^{}');
    expect(tokens).toEqual([
      { kind: 'text', value: 'x' },
      { kind: 'sup', value: '' },
    ]);
  });
});

