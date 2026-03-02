import { describe, it, expect } from 'vitest';
import { exportChatToMarkdown, exportChatToJson, escapeStructuralMarkdown, wrapDisplayLatex } from '@/lib/client/export-chat';
import type { ChatMessage } from '@/types/agent';

const msgs: ChatMessage[] = [
  { id: 'm1', role: 'user', content: 'Hello **world**', createdAt: 1000 },
  { id: 'm2', role: 'assistant', content: 'Hi! \\(x^2\\)', createdAt: 2000 },
  { id: 'm3', role: 'user', content: '```js\nconsole.log(1)\n```', createdAt: 3000 },
];

const meta = { id: 'c1', title: 'Test Chat', messageCount: 3 };

describe('exportChatToMarkdown', () => {
  it('contains title and all messages', () => {
    const md = exportChatToMarkdown(msgs, 'Test Chat');
    expect(md).toContain('# Test Chat');
    expect(md).toContain('## User');
    expect(md).toContain('## Assistant');
    expect(md).toContain('Hello **world**');
    expect(md).toContain('\\(x^2\\)');
  });

  it('preserves code blocks verbatim', () => {
    const md = exportChatToMarkdown(msgs, 'Chat');
    expect(md).toContain('```js\nconsole.log(1)\n```');
  });

  it('includes export timestamp', () => {
    const md = exportChatToMarkdown([], 'Empty');
    expect(md).toMatch(/Exported: \d{4}-\d{2}-\d{2}/);
  });

  it('escapes --- in message content to prevent false HR', () => {
    const messages: ChatMessage[] = [
      { id: 'm1', role: 'user', content: 'before\n---\nafter', createdAt: 1000 },
    ];
    const md = exportChatToMarkdown(messages, 'Test');
    expect(md).toContain('before\n\\---\nafter');
    // The structural --- divider should still be present
    const structuralHRCount = md.split('\n').filter(l => l === '---').length;
    expect(structuralHRCount).toBeGreaterThanOrEqual(2); // header + message dividers
  });

  it('preserves ## Heading in message content verbatim', () => {
    const messages: ChatMessage[] = [
      { id: 'm1', role: 'user', content: '## My Heading', createdAt: 1000 },
    ];
    const md = exportChatToMarkdown(messages, 'Test');
    expect(md).toContain('## My Heading');
  });

  it('escapes *** and ___ HR variants in content', () => {
    expect(escapeStructuralMarkdown('***')).toBe('\\***');
    expect(escapeStructuralMarkdown('___')).toBe('\\___');
    expect(escapeStructuralMarkdown('- - -')).toBe('\\- - -');
  });

  it('does not escape non-HR content', () => {
    expect(escapeStructuralMarkdown('normal text')).toBe('normal text');
    expect(escapeStructuralMarkdown('-- not enough')).toBe('-- not enough');
  });

  // --- 3C: LaTeX delimiter preservation ---

  it('wraps display LaTeX in code fences', () => {
    const messages: ChatMessage[] = [
      { id: 'm1', role: 'assistant', content: '$$\n\\frac{a}{b}\n$$', createdAt: 1000 },
    ];
    const md = exportChatToMarkdown(messages, 'Test');
    expect(md).toContain('```latex');
    expect(md).toContain('\\frac{a}{b}');
    // Should not contain bare $$
    expect(md).not.toContain('$$');
  });

  it('preserves inline LaTeX as-is', () => {
    const messages: ChatMessage[] = [
      { id: 'm1', role: 'user', content: 'The formula $E=mc^2$ is famous', createdAt: 1000 },
    ];
    const md = exportChatToMarkdown(messages, 'Test');
    expect(md).toContain('$E=mc^2$');
    expect(md).not.toContain('```latex');
  });
});

describe('exportChatToJson', () => {
  it('returns valid JSON with meta and messages', () => {
    const json = exportChatToJson(msgs, meta);
    const parsed = JSON.parse(json);
    expect(parsed.meta.id).toBe('c1');
    expect(parsed.meta.title).toBe('Test Chat');
    expect(parsed.meta.exportedAt).toBeDefined();
    expect(parsed.messages).toHaveLength(3);
  });

  it('preserves message content exactly', () => {
    const json = exportChatToJson(msgs, meta);
    const parsed = JSON.parse(json);
    expect(parsed.messages[1].content).toBe('Hi! \\(x^2\\)');
    expect(parsed.messages[0].role).toBe('user');
  });

  it('includes all required message fields', () => {
    const json = exportChatToJson(msgs, meta);
    const parsed = JSON.parse(json);
    for (const m of parsed.messages) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('role');
      expect(m).toHaveProperty('content');
      expect(m).toHaveProperty('createdAt');
    }
  });
});
