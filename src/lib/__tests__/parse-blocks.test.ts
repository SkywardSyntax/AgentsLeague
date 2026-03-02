import { describe, it, expect } from 'vitest';
import { parseBlocks } from '../markdown/parse-blocks';

describe('parseBlocks', () => {
  it('parses a simple paragraph', () => {
    const result = parseBlocks('Hello world');
    expect(result).toEqual([{ kind: 'paragraph', content: 'Hello world' }]);
  });

  it('parses a fenced code block', () => {
    const input = '```python\nprint("hi")\n```';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'code_block', content: 'print("hi")', language: 'python' },
    ]);
  });

  it('parses a code block with no language', () => {
    const input = '```\nsome code\n```';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'code_block', content: 'some code', language: '' },
    ]);
  });

  it('handles unclosed code fence (streaming) as code block', () => {
    const input = '```typescript\nconst x = 1;\nconst y = 2;';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'code_block', content: 'const x = 1;\nconst y = 2;', language: 'typescript' },
    ]);
  });

  it('parses headings at different levels', () => {
    const input = '# H1\n## H2\n### H3';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'heading', content: 'H1', level: 1 },
      { kind: 'heading', content: 'H2', level: 2 },
      { kind: 'heading', content: 'H3', level: 3 },
    ]);
  });

  it('parses horizontal rules', () => {
    const input = 'Above\n\n---\n\nBelow';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'paragraph', content: 'Above' },
      { kind: 'hr' },
      { kind: 'paragraph', content: 'Below' },
    ]);
  });

  it('parses unordered lists', () => {
    const input = '- item 1\n- item 2\n- item 3';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'list', ordered: false, items: ['item 1', 'item 2', 'item 3'] },
    ]);
  });

  it('parses ordered lists', () => {
    const input = '1. first\n2. second\n3. third';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'list', ordered: true, items: ['first', 'second', 'third'] },
    ]);
  });

  it('parses blockquotes', () => {
    const input = '> This is a quote\n> Second line';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'blockquote', content: 'This is a quote\nSecond line' },
    ]);
  });

  it('parses mixed content correctly', () => {
    const input = [
      '# Title',
      '',
      'Some paragraph text.',
      '',
      '```js',
      'console.log("hello");',
      '```',
      '',
      '- item a',
      '- item b',
      '',
      '> a quote',
    ].join('\n');

    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'heading', content: 'Title', level: 1 },
      { kind: 'paragraph', content: 'Some paragraph text.' },
      { kind: 'code_block', content: 'console.log("hello");', language: 'js' },
      { kind: 'list', ordered: false, items: ['item a', 'item b'] },
      { kind: 'blockquote', content: 'a quote' },
    ]);
  });

  it('handles tilde code fences', () => {
    const input = '~~~ruby\nputs "hi"\n~~~';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'code_block', content: 'puts "hi"', language: 'ruby' },
    ]);
  });

  it('does not treat --- inside code fence as hr', () => {
    const input = '```\n---\n```';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'code_block', content: '---', language: '' },
    ]);
  });

  it('handles multiple consecutive paragraphs separated by blank lines', () => {
    const input = 'Para 1\n\nPara 2';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'paragraph', content: 'Para 1' },
      { kind: 'paragraph', content: 'Para 2' },
    ]);
  });

  it('handles multiline paragraph (no blank line between)', () => {
    const input = 'Line 1\nLine 2\nLine 3';
    const result = parseBlocks(input);
    expect(result).toEqual([
      { kind: 'paragraph', content: 'Line 1\nLine 2\nLine 3' },
    ]);
  });
});
