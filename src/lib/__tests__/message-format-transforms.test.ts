import { describe, expect, it } from 'vitest';
import { formatSSE } from '@/lib/server/sse';
import type { ChatMessage } from '@/types/agent';

interface SimpleQueue<T> {
  enqueue(item: T): void;
  drain(): T[];
  peek(): T[];
  count(): number;
}

function createSimpleQueue<T>(): SimpleQueue<T> {
  let buffer: T[] = [];
  return {
    enqueue(item: T) { buffer.push(item); },
    drain() { const items = buffer; buffer = []; return items; },
    peek() { return [...buffer]; },
    count() { return buffer.length; },
  };
}

describe('iter28 · Message formatting transforms', () => {
  it('ChatMessage with markdown content preserved through queue enqueue/drain', () => {
    const queue = createSimpleQueue<ChatMessage>();
    const msg: ChatMessage = { id: 'm1', role: 'user', content: '**bold** _italic_ `code`', createdAt: 1000 };
    queue.enqueue(msg);
    const drained = queue.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]!.content).toBe('**bold** _italic_ `code`');
  });

  it('ChatMessage with HTML entities in content preserved', () => {
    const queue = createSimpleQueue<ChatMessage>();
    const msg: ChatMessage = { id: 'm2', role: 'assistant', content: '<div>&amp; &lt;tag&gt;</div>', createdAt: 1000 };
    queue.enqueue(msg);
    const drained = queue.drain();
    expect(drained[0]!.content).toBe('<div>&amp; &lt;tag&gt;</div>');
  });

  it('ChatMessage with unicode/emoji content preserved', () => {
    const queue = createSimpleQueue<ChatMessage>();
    const msg: ChatMessage = { id: 'm3', role: 'user', content: '🎉 café résumé 中文 العربية', createdAt: 1000 };
    queue.enqueue(msg);
    const drained = queue.drain();
    expect(drained[0]!.content).toBe('🎉 café résumé 中文 العربية');
  });

  it('formatSSE preserves all ChatMessage fields in JSON serialization', () => {
    const msg: ChatMessage = { id: 'msg-42', role: 'system', content: 'test content', createdAt: 1234567890 };
    const sse = formatSSE(msg);
    const parsed = JSON.parse(sse.replace(/^data: /, '').trim());
    expect(parsed.id).toBe('msg-42');
    expect(parsed.role).toBe('system');
    expect(parsed.content).toBe('test content');
    expect(parsed.createdAt).toBe(1234567890);
  });

  it('formatSSE output parseable back to identical payload (roundtrip)', () => {
    const payload = { type: 'assistant.text.delta', turnId: 't1', delta: 'hello' };
    const sse = formatSSE(payload);
    const jsonStr = sse.replace(/^data: /, '').trim();
    const parsed = JSON.parse(jsonStr);
    expect(parsed).toEqual(payload);
  });

  it('empty string content preserved (not dropped)', () => {
    const queue = createSimpleQueue<ChatMessage>();
    const msg: ChatMessage = { id: 'm4', role: 'user', content: '', createdAt: 1000 };
    queue.enqueue(msg);
    const drained = queue.drain();
    expect(drained[0]!.content).toBe('');

    const sse = formatSSE({ content: '' });
    const parsed = JSON.parse(sse.replace(/^data: /, '').trim());
    expect(parsed.content).toBe('');
  });

  it('very long content (10000 chars) not truncated through queue', () => {
    const queue = createSimpleQueue<ChatMessage>();
    const longContent = 'x'.repeat(10000);
    const msg: ChatMessage = { id: 'm5', role: 'assistant', content: longContent, createdAt: 1000 };
    queue.enqueue(msg);
    const drained = queue.drain();
    expect(drained[0]!.content).toHaveLength(10000);
  });

  it('special JSON chars (quotes, backslashes, newlines) escaped correctly in formatSSE', () => {
    const payload = { text: 'line1\nline2\t"quoted"\\path' };
    const sse = formatSSE(payload);
    const parsed = JSON.parse(sse.replace(/^data: /, '').trim());
    expect(parsed.text).toBe('line1\nline2\t"quoted"\\path');
  });

  it('multiple messages preserve ordering through queue', () => {
    const queue = createSimpleQueue<ChatMessage>();
    const msgs: ChatMessage[] = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`, role: 'user' as const, content: `msg-${i}`, createdAt: 1000 + i,
    }));
    msgs.forEach(m => queue.enqueue(m));
    const drained = queue.drain();
    expect(drained.map(m => m.content)).toEqual(['msg-0', 'msg-1', 'msg-2', 'msg-3', 'msg-4']);
  });

  it('drain returns empty array on second call (idempotent drain)', () => {
    const queue = createSimpleQueue<ChatMessage>();
    queue.enqueue({ id: 'm1', role: 'user', content: 'hi', createdAt: 1000 });
    expect(queue.drain()).toHaveLength(1);
    expect(queue.drain()).toHaveLength(0);
    expect(queue.drain()).toHaveLength(0);
  });
});
