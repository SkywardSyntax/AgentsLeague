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
