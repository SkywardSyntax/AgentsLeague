import { describe, it, expect } from 'vitest';
import { exportChatToMarkdown, exportChatToJson, escapeStructuralMarkdown, wrapDisplayLatex, safeFilename } from '@/lib/client/export-chat';
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

describe('safeFilename', () => {
  it('sanitizes normal title', () => {
    expect(safeFilename('My Chat!')).toBe('My-Chat');
  });

  it('returns default for empty string', () => {
    expect(safeFilename('')).toBe('chat-export');
  });

  it('falls back to default for unicode-only title', () => {
    expect(safeFilename('数学讨论')).toBe('chat-export');
  });

  it('truncates long titles to 80 chars', () => {
    const long = 'a'.repeat(200);
    const result = safeFilename(long);
    expect(result.length).toBeLessThanOrEqual(80);
  });

  it('strips dangerous special chars', () => {
    expect(safeFilename('a/b\\c:d*e')).toBe('abcde');
  });

  it('collapses whitespace to single hyphen', () => {
    expect(safeFilename('hello   world')).toBe('hello-world');
  });
});

describe('wrapDisplayLatex', () => {
  it('wraps adjacent $$ blocks separately', () => {
    const input = '$$a+b$$\n$$c+d$$';
    const result = wrapDisplayLatex(input);
    expect(result).toContain('```latex\na+b\n```');
    expect(result).toContain('```latex\nc+d\n```');
    expect(result).not.toContain('$$');
  });

  it('does not wrap $$ mid-line (e.g. currency)', () => {
    const input = 'The price is $$5.00 today';
    const result = wrapDisplayLatex(input);
    expect(result).not.toContain('```latex');
    expect(result).toBe(input);
  });
});

describe('exportChatToMarkdown edge cases', () => {
  it('empty messages array produces header only', () => {
    const md = exportChatToMarkdown([], 'Empty');
    expect(md).toContain('# Empty');
    expect(md).toContain('Exported:');
    expect(md).not.toContain('## User');
    expect(md).not.toContain('## Assistant');
  });
});

// --- iter7 3B: safeFilename + escapeStructuralMarkdown + wrapDisplayLatex defensive edge cases ---

describe('safeFilename edge cases', () => {
  it('returns default for spaces-only input', () => {
    expect(safeFilename('   ')).toBe('chat-export');
  });

  it('strips emoji and keeps latin characters', () => {
    const result = safeFilename('My Chat 🚀 Notes');
    expect(result).toBe('My-Chat-Notes');
  });
});

describe('escapeStructuralMarkdown edge cases', () => {
  it('escapes only the HR line in multi-line input', () => {
    const input = 'line one\n---\nline three';
    const result = escapeStructuralMarkdown(input);
    expect(result).toBe('line one\n\\---\nline three');
  });

  it('does not escape -- (only two dashes, insufficient for HR)', () => {
    expect(escapeStructuralMarkdown('--')).toBe('--');
  });
});

describe('wrapDisplayLatex edge cases', () => {
  it('handles $$ at end of string with no trailing newline', () => {
    const input = '$$\nx+y\n$$';
    const result = wrapDisplayLatex(input);
    expect(result).toContain('```latex');
    expect(result).toContain('x+y');
    expect(result).not.toContain('$$');
  });

  it('handles empty $$$$ as empty code fence', () => {
    const input = '$$\n\n$$';
    const result = wrapDisplayLatex(input);
    expect(result).toContain('```latex');
    expect(result).not.toContain('$$');
  });
});

// --- iter10 03-A: additional edge cases ---

describe('exportChatToMarkdown system role', () => {
  it('labels non-user non-assistant roles as System', () => {
    const messages: ChatMessage[] = [
      { id: 'm1', role: 'system' as ChatMessage['role'], content: 'You are helpful', createdAt: 1000 },
    ];
    const md = exportChatToMarkdown(messages, 'Test');
    expect(md).toContain('## System');
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

  it('handles empty messages array', () => {
    const json = exportChatToJson([], meta);
    const parsed = JSON.parse(json);
    expect(parsed.messages).toEqual([]);
    expect(parsed.meta.id).toBe('c1');
    expect(parsed.meta.messageCount).toBe(3);
  });

  it('includes messageCount from meta', () => {
    const json = exportChatToJson(msgs, { id: 'c2', title: 'T', messageCount: 42 });
    const parsed = JSON.parse(json);
    expect(parsed.meta.messageCount).toBe(42);
  });
});
