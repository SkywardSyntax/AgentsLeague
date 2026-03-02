import { describe, expect, it } from 'vitest';
import { createOfflineQueue } from '@/lib/chat/offline-queue';
import type { ChatMessage } from '@/types/agent';

function makeMsg(id: string, content = `msg-${id}`): ChatMessage {
  return { id, role: 'user', content, createdAt: Date.now() };
}

describe('createOfflineQueue', () => {
  it('returns object with enqueue, drain, peek, count, onOnline methods', () => {
    const q = createOfflineQueue();
    expect(typeof q.enqueue).toBe('function');
    expect(typeof q.drain).toBe('function');
    expect(typeof q.peek).toBe('function');
    expect(typeof q.count).toBe('function');
    expect(typeof q.onOnline).toBe('function');
  });

  it('enqueue followed by drain returns the enqueued message', () => {
    const q = createOfflineQueue();
    const msg = makeMsg('1');
    q.enqueue(msg);
    expect(q.drain()).toEqual([msg]);
  });

  it('enqueueing 3 messages and draining returns all 3 in FIFO order', () => {
    const q = createOfflineQueue();
    const msgs = [makeMsg('a'), makeMsg('b'), makeMsg('c')];
    msgs.forEach((m) => q.enqueue(m));
    expect(q.drain()).toEqual(msgs);
  });

  it('drain clears the queue — second drain returns empty array', () => {
    const q = createOfflineQueue();
    q.enqueue(makeMsg('1'));
    q.drain();
    expect(q.drain()).toEqual([]);
  });

  it('peek returns queued messages without clearing the buffer', () => {
    const q = createOfflineQueue();
    const msg = makeMsg('1');
    q.enqueue(msg);
    expect(q.peek()).toEqual([msg]);
    expect(q.peek()).toEqual([msg]); // still there
  });

  it('count returns 0 on fresh queue, increments with each enqueue', () => {
    const q = createOfflineQueue();
    expect(q.count()).toBe(0);
    q.enqueue(makeMsg('1'));
    expect(q.count()).toBe(1);
    q.enqueue(makeMsg('2'));
    expect(q.count()).toBe(2);
  });

  it('count returns 0 after drain', () => {
    const q = createOfflineQueue();
    q.enqueue(makeMsg('1'));
    q.enqueue(makeMsg('2'));
    q.drain();
    expect(q.count()).toBe(0);
  });

  it('onOnline callback is invoked when simulateOnline is called', () => {
    const q = createOfflineQueue();
    let called = false;
    q.onOnline(() => {
      called = true;
    });
    q.simulateOnline();
    expect(called).toBe(true);
  });

  it('onOnline callback receives the current queue contents as argument', () => {
    const q = createOfflineQueue();
    const msg = makeMsg('1');
    q.enqueue(msg);
    let received: ChatMessage[] = [];
    q.onOnline((pending) => {
      received = pending;
    });
    q.simulateOnline();
    expect(received).toEqual([msg]);
  });

  it('multiple onOnline registrations all fire on connectivity restore', () => {
    const q = createOfflineQueue();
    let count = 0;
    q.onOnline(() => count++);
    q.onOnline(() => count++);
    q.onOnline(() => count++);
    q.simulateOnline();
    expect(count).toBe(3);
  });

  it('enqueue on a drained queue starts a new batch (no leftover from previous drain)', () => {
    const q = createOfflineQueue();
    q.enqueue(makeMsg('old'));
    q.drain();
    const fresh = makeMsg('new');
    q.enqueue(fresh);
    expect(q.drain()).toEqual([fresh]);
  });
});
