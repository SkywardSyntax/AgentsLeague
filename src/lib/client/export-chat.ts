import type { ChatMessage } from '@/types/agent';
import type { ChatThreadMeta } from '@/components/chat/ChatPanel';

/** Sanitize a string for use as a filename. */
export function safeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'chat-export';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Escape standalone HR patterns in content to prevent structural confusion in exports. */
export function escapeStructuralMarkdown(content: string): string {
  return content.replace(/^([-*_])(\s*\1){2,}\s*$/gm, (match) => `\\${match}`);
}

/** Wrap display-math $$ blocks in code fences to preserve them structurally.
 *  Only matches $$ at line boundaries to avoid false positives with currency (e.g., $$5.00). */
export function wrapDisplayLatex(content: string): string {
  return content.replace(
    /^\$\$([\s\S]*?)\$\$\s*$/gm,
    (_match, inner: string) => '```latex\n' + inner.trim() + '\n```',
  );
}

/** Format messages as Markdown. */
export function exportChatToMarkdown(messages: ChatMessage[], title: string): string {
  const header = `# ${title}\n\nExported: ${new Date().toISOString()}\n\n---\n\n`;
  const body = messages
    .map((m) => {
      const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System';
      return `## ${role}\n\n${escapeStructuralMarkdown(wrapDisplayLatex(m.content))}\n\n---\n`;
    })
    .join('\n');
  return header + body;
}

/** Format messages as JSON with metadata. */
export function exportChatToJson(messages: ChatMessage[], meta: ChatThreadMeta): string {
  return JSON.stringify(
    {
      meta: { id: meta.id, title: meta.title, messageCount: meta.messageCount, exportedAt: new Date().toISOString() },
      messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
    },
    null,
    2,
  );
}

/** Download chat as Markdown file. */
export function downloadChatAsMarkdown(
  messages: ChatMessage[],
  title: string,
  onError?: (msg: string) => void,
): void {
  try {
    const md = exportChatToMarkdown(messages, title);
    triggerDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${safeFilename(title)}.md`);
  } catch {
    onError?.('Export failed — chat may be too large. Try selecting fewer messages.');
  }
}

/** Download chat as JSON file. */
export function downloadChatAsJson(
  messages: ChatMessage[],
  meta: ChatThreadMeta,
  onError?: (msg: string) => void,
): void {
  try {
    const json = exportChatToJson(messages, meta);
    triggerDownload(new Blob([json], { type: 'application/json;charset=utf-8' }), `${safeFilename(meta.title)}.json`);
  } catch {
    onError?.('Export failed — chat may be too large. Try selecting fewer messages.');
  }
}
