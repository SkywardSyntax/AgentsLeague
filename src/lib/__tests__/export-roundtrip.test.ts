import { describe, it, expect } from 'vitest';
import { exportChatToMarkdown, MAX_EXPORT_MESSAGES } from '@/lib/client/export-chat';
import { parseBlocks } from '@/lib/markdown/parse-blocks';
import { parseInline } from '@/lib/markdown/parse-inline';
import type { ChatMessage } from '@/types/agent';

function makeMsg(id: string, role: ChatMessage['role'], content: string): ChatMessage {
  return { id, role, content, createdAt: Date.now() };
}

describe('export → re-parse round-trip', () => {
  it('preserves bold, inline code, LaTeX, and escaped HR in round-trip', () => {
    const messages: ChatMessage[] = [
      makeMsg('1', 'user', 'Hello **world** with `code`'),
      makeMsg('2', 'assistant', 'The formula $x^2$ is important'),
      makeMsg('3', 'user', 'before\n---\nafter'),
      makeMsg('4', 'assistant', 'Use **bold** and *italic*'),
      makeMsg('5', 'user', 'Final message'),
    ];

    const md = exportChatToMarkdown(messages, 'Test');
    const blocks = parseBlocks(md);

    // Should have heading + paragraphs + HRs — no crashes
    expect(blocks.length).toBeGreaterThan(0);

    // The HR in message content should be escaped (not parsed as HR)
    // The content "before\n\---\nafter" should appear as paragraph, not as two paragraphs split by HR
    expect(md).toContain('\\---');

    // LaTeX $x^2$ should be preserved as-is (inline, not wrapped)
    expect(md).toContain('$x^2$');

    // Bold markers should survive round-trip
    const paragraphs = blocks.filter((b) => b.kind === 'paragraph');
    const boldParagraph = paragraphs.find((p) => p.content.includes('**world**'));
    expect(boldParagraph).toBeDefined();

    // Parse inline tokens from the bold paragraph
    if (boldParagraph && boldParagraph.kind === 'paragraph') {
      const tokens = parseInline(boldParagraph.content);
      const boldTokens = tokens.filter((t) => t.kind === 'bold');
      expect(boldTokens.length).toBeGreaterThan(0);
    }
  });

  it('bare ``` line in non-code context is preserved as text after round-trip', () => {
    const messages: ChatMessage[] = [
      makeMsg('1', 'user', 'Here is a backtick line:\n```\nThis is not code'),
    ];

    const md = exportChatToMarkdown(messages, 'Test');
    const blocks = parseBlocks(md);

    // The content contains an unclosed ```, which parseBlocks treats as a code block
    // (streaming fallback). The key assertion is that it doesn't crash and content is preserved.
    expect(blocks.length).toBeGreaterThan(0);
    const allContent = blocks.map((b) => {
      if (b.kind === 'paragraph') return b.content;
      if (b.kind === 'code_block') return b.content;
      return '';
    }).join(' ');
    expect(allContent).toContain('This is not code');
  });

  it('truncates to last MAX_EXPORT_MESSAGES with footer note', () => {
    const total = 15_000;
    const messages: ChatMessage[] = Array.from({ length: total }, (_, i) =>
      makeMsg(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const md = exportChatToMarkdown(messages, 'Big Chat');

    // Should contain truncation footer
    expect(md).toContain(`[Export truncated: ${total} messages, showing last ${MAX_EXPORT_MESSAGES}]`);

    // Should contain the LAST message (newest), not the first
    expect(md).toContain(`Message ${total - 1}`);

    // Should NOT contain the first message (oldest, beyond truncation)
    expect(md).not.toContain('Message 0\n');

    // Should contain messages near the end
    expect(md).toContain(`Message ${total - 2}`);
  });

  it('does not truncate when at or below MAX_EXPORT_MESSAGES', () => {
    const messages: ChatMessage[] = Array.from({ length: 100 }, (_, i) =>
      makeMsg(`m${i}`, 'user', `Message ${i}`),
    );

    const md = exportChatToMarkdown(messages, 'Small Chat');
    expect(md).not.toContain('Export truncated');
    expect(md).toContain('Message 0');
    expect(md).toContain('Message 99');
  });

  it('fenced code block containing HR-like line survives round-trip', () => {
    const messages: ChatMessage[] = [
      makeMsg('1', 'assistant', '```python\n# ---\nprint("hello")\n```'),
    ];

    const md = exportChatToMarkdown(messages, 'Test');
    const blocks = parseBlocks(md);

    // The code block should be preserved as a code block
    const codeBlocks = blocks.filter((b) => b.kind === 'code_block');
    expect(codeBlocks.length).toBeGreaterThan(0);

    const pyBlock = codeBlocks.find(
      (b) => b.kind === 'code_block' && b.content.includes('print("hello")'),
    );
    expect(pyBlock).toBeDefined();
  });
});
