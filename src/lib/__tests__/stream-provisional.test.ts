import { describe, it, expect } from 'vitest';
import {
  normalizeChunkKey,
  extractStableChunks,
  estimateProvisionalAdvance,
} from '@/lib/server/stream/provisional';

describe('normalizeChunkKey', () => {
  it('normalizes whitespace and case', () => {
    expect(normalizeChunkKey('text', '  Hello   World  ')).toBe('text:hello world');
  });

  it('prefixes with kind', () => {
    expect(normalizeChunkKey('latex', 'x^2')).toBe('latex:x^2');
  });

  it('is case-insensitive and collapses multiple whitespace types', () => {
    expect(normalizeChunkKey('text', '\tHELLO\n\nWORLD\t')).toBe('text:hello world');
  });
});

describe('extractStableChunks', () => {
  it('extracts LaTeX display blocks', () => {
    const content = 'Some text\n\\[x^2 + y^2 = r^2\\]\nMore text\n';
    const chunks = extractStableChunks(content);
    expect(chunks).toEqual(
      expect.arrayContaining([{ kind: 'latex', value: 'x^2 + y^2 = r^2' }]),
    );
  });

  it('extracts numbered list items from complete lines', () => {
    const content = '1. First step\n2. Second step\n';
    const chunks = extractStableChunks(content);
    expect(chunks.filter((c) => c.kind === 'text')).toHaveLength(2);
  });

  it('extracts bullet list items', () => {
    const content = '- Item one\n* Item two\n';
    const chunks = extractStableChunks(content);
    expect(chunks.filter((c) => c.kind === 'text')).toHaveLength(2);
  });

  it('ignores incomplete last line', () => {
    const content = '1. Complete line\nincomplete';
    const chunks = extractStableChunks(content);
    const textChunks = chunks.filter((c) => c.kind === 'text');
    expect(textChunks).toHaveLength(1);
    expect(textChunks[0]!.value).toBe('1. Complete line');
  });

  it('returns empty for plain text', () => {
    const chunks = extractStableChunks('just some paragraph text');
    expect(chunks).toHaveLength(0);
  });

  it('extracts $$...$$ display math', () => {
    const content = 'Some text\n$$E = mc^2$$\nMore text\n';
    const chunks = extractStableChunks(content);
    expect(chunks).toEqual(
      expect.arrayContaining([{ kind: 'latex', value: 'E = mc^2' }]),
    );
  });

  it('extracts multiline $$...$$ display math', () => {
    const content = '$$\nx^2 +\ny^2\n$$\n';
    const chunks = extractStableChunks(content);
    const latexChunks = chunks.filter((c) => c.kind === 'latex');
    expect(latexChunks).toHaveLength(1);
    expect(latexChunks[0]!.value).toContain('x^2');
  });

  it('skips content inside fenced code blocks', () => {
    const content = '1. Before code\n```\n- Inside code block\n2. Also inside\n```\n3. After code\n';
    const chunks = extractStableChunks(content);
    const textChunks = chunks.filter((c) => c.kind === 'text');
    expect(textChunks).toHaveLength(2);
    expect(textChunks[0]!.value).toBe('1. Before code');
    expect(textChunks[1]!.value).toBe('3. After code');
  });

  it('does not extract inline $...$ as standalone chunks', () => {
    const content = 'The value $x^2$ is important\n';
    const chunks = extractStableChunks(content);
    const latexChunks = chunks.filter((c) => c.kind === 'latex');
    expect(latexChunks).toHaveLength(0);
  });
});

describe('estimateProvisionalAdvance', () => {
  it('returns positive for text chunks', () => {
    const advance = estimateProvisionalAdvance({ kind: 'text', value: 'A simple step' });
    expect(advance).toBeGreaterThan(0);
  });

  it('returns minimum 88 for latex chunks', () => {
    const advance = estimateProvisionalAdvance({ kind: 'latex', value: 'x' });
    expect(advance).toBeGreaterThanOrEqual(88);
  });

  it('returns more for complex latex', () => {
    const simple = estimateProvisionalAdvance({ kind: 'latex', value: 'x^2' });
    const complex = estimateProvisionalAdvance({
      kind: 'latex',
      value: '\\frac{\\sqrt{x^2 + y^2}}{\\int_0^1 f(t) dt}',
    });
    expect(complex).toBeGreaterThan(simple);
  });
});
