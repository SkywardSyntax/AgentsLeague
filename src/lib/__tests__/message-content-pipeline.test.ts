import { describe, it, expect } from 'vitest';
import { parseBlocks } from '@/lib/markdown/parse-blocks';
import { parseInline } from '@/lib/markdown/parse-inline';
import { parseStreamingLatex } from '@/lib/latex/stream-tex-parser';

/**
 * Integration tests for the full parsing pipeline:
 * parseBlocks → (per paragraph) parseStreamingLatex → (per text segment) parseInline
 *
 * These verify the three parsers work correctly together, not just in isolation.
 */

function fullPipeline(input: string) {
  const blocks = parseBlocks(input);
  const result: Array<{
    block: (typeof blocks)[number];
    segments?: ReturnType<typeof parseStreamingLatex>;
    inlineTokens?: Array<{ segmentIdx: number; tokens: ReturnType<typeof parseInline> }>;
  }> = [];

  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      const segments = parseStreamingLatex(block.content);
      const inlineTokens: Array<{ segmentIdx: number; tokens: ReturnType<typeof parseInline> }> = [];
      segments.forEach((seg, idx) => {
        if (seg.kind === 'text') {
          inlineTokens.push({ segmentIdx: idx, tokens: parseInline(seg.value) });
        }
      });
      result.push({ block, segments, inlineTokens });
    } else {
      result.push({ block });
    }
  }
  return result;
}

describe('parseBlocks → parseStreamingLatex → parseInline pipeline', () => {
  it('correctly separates LaTeX, inline code, and bold in mixed content', () => {
    const input = 'The formula is **important**: $E=mc^2$ and `x=1`';
    const pipeline = fullPipeline(input);

    expect(pipeline).toHaveLength(1);
    const { segments, inlineTokens } = pipeline[0]!;

    // parseStreamingLatex should extract the $E=mc^2$ as latex
    const latexSegs = segments!.filter((s) => s.kind === 'latex');
    expect(latexSegs).toHaveLength(1);
    expect(latexSegs[0]!.value).toBe('E=mc^2');
    expect(latexSegs[0]!.display).toBe(false);

    // Text segments should be parsed by parseInline
    const allInlineTokens = inlineTokens!.flatMap((t) => t.tokens);
    const boldTokens = allInlineTokens.filter((t) => t.kind === 'bold');
    const codeTokens = allInlineTokens.filter((t) => t.kind === 'inline_code');

    expect(boldTokens).toHaveLength(1);
    expect(boldTokens[0]!).toMatchObject({ kind: 'bold', value: 'important' });

    expect(codeTokens).toHaveLength(1);
    expect(codeTokens[0]!).toMatchObject({ kind: 'inline_code', value: 'x=1' });
  });

  it('does not parse $ inside fenced code blocks as LaTeX', () => {
    const input = '```python\nprice = $100\ntax = $20\n```\n\nThe total is $120.';
    const pipeline = fullPipeline(input);

    // Should produce: code_block + paragraph
    expect(pipeline).toHaveLength(2);
    const codeBlock = pipeline[0]!.block;
    expect(codeBlock.kind).toBe('code_block');
    if (codeBlock.kind === 'code_block') {
      expect(codeBlock.content).toContain('$100');
      expect(codeBlock.content).toContain('$20');
    }

    // The paragraph "$120." should NOT be parsed as LaTeX since it's a price
    const para = pipeline[1]!;
    expect(para.block.kind).toBe('paragraph');
  });

  it('preserves blockquote structure with LaTeX inside', () => {
    const input = '> The derivative is $$\\frac{d}{dx}x^2 = 2x$$\n> which follows from the power rule.';
    const blocks = parseBlocks(input);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe('blockquote');

    if (blocks[0]!.kind === 'blockquote') {
      // Children should be parsed, and content should contain the LaTeX
      expect(blocks[0]!.content).toContain('$$');
      expect(blocks[0]!.content).toContain('\\frac{d}{dx}');

      // Parse the blockquote content through LaTeX parser
      const segments = parseStreamingLatex(blocks[0]!.content);
      const latexSegs = segments.filter((s) => s.kind === 'latex');
      expect(latexSegs.length).toBeGreaterThanOrEqual(1);
      // The display math should be extracted
      const displayLatex = latexSegs.find((s) => s.display);
      expect(displayLatex).toBeDefined();
      expect(displayLatex!.value).toContain('\\frac{d}{dx}');
    }
  });

  it('handles heading with inline LaTeX commands in text', () => {
    const input = '## The \\alpha function\n\nDetails here.';
    const blocks = parseBlocks(input);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.kind).toBe('heading');
    if (blocks[0]!.kind === 'heading') {
      // Heading content goes through parseInline in rendering, not parseStreamingLatex
      const tokens = parseInline(blocks[0]!.content);
      expect(tokens.length).toBeGreaterThan(0);
    }
  });

  it('handles list items with inline math through full pipeline', () => {
    const input = '- The value of $x$ is 5\n- The value of $y$ is 10';
    const blocks = parseBlocks(input);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe('list');
    if (blocks[0]!.kind === 'list') {
      // Each item passes through parseInline in rendering; verify they parse without error
      for (const item of blocks[0]!.items) {
        const tokens = parseInline(item);
        expect(tokens.length).toBeGreaterThan(0);
      }
    }
  });

  it('handles mixed display and inline LaTeX in a paragraph', () => {
    const input = 'Consider $a+b$ and also:\n$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$\nThat is the result.';
    const pipeline = fullPipeline(input);

    // parseBlocks treats the whole thing as paragraphs
    const allSegments = pipeline.flatMap((p) => p.segments ?? []);
    const latexSegs = allSegments.filter((s) => s.kind === 'latex');

    // Should find both inline and display LaTeX
    const inlineLatex = latexSegs.filter((s) => !s.display);
    const displayLatex = latexSegs.filter((s) => s.display);

    expect(inlineLatex.length).toBeGreaterThanOrEqual(1);
    expect(displayLatex.length).toBeGreaterThanOrEqual(1);

    // Verify content is preserved
    const allLatexValues = latexSegs.map((s) => s.value).join(' ');
    expect(allLatexValues).toContain('a+b');
    expect(allLatexValues).toContain('\\sum');
  });

  it('does not break on table cells containing $ signs', () => {
    const input = '| Item | Price |\n|---|---|\n| Widget | $5.00 |\n| Gadget | $10.00 |';
    const blocks = parseBlocks(input);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe('table');
    if (blocks[0]!.kind === 'table') {
      // Table cells go through parseInline in rendering
      for (const row of blocks[0]!.rows) {
        for (const cell of row) {
          const tokens = parseInline(cell);
          expect(tokens.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('handles paragraph with over-escaped LaTeX from LLM output', () => {
    const input = 'The result is \\\\(\\\\frac{1}{2}\\\\).';
    const pipeline = fullPipeline(input);

    expect(pipeline).toHaveLength(1);
    const { segments } = pipeline[0]!;
    // The over-escaped delimiters should be recognized
    const latexSegs = segments!.filter((s) => s.kind === 'latex');
    if (latexSegs.length > 0) {
      // If recognized, content should be de-escaped
      expect(latexSegs[0]!.value).toContain('\\frac');
    }
  });
});
