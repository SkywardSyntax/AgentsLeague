import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PersistedSessionV3 } from '@/lib/client/persistence';

function makeV3Session(overrides?: Partial<PersistedSessionV3>): PersistedSessionV3 {
  return {
    version: 3,
    updatedAt: Date.now(),
    activeChatId: 'chat-1',
    chats: [{
      id: 'chat-1',
      title: 'Test Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hello', createdAt: Date.now() },
        { id: 'msg-2', role: 'assistant', content: 'Hi there', createdAt: Date.now() },
      ],
      semanticScene: [],
      scene: [],
      plannerMeta: [],
    }],
    prefs: { panelSizes: [50, 50] },
    ...overrides,
  };
}

const STORAGE_KEY = 'agentsleague:session:v1';

describe('Reducer↔Persistence contract', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
    });
  });

  it('V3 session with messages round-trips through save→load', async () => {
    const { saveSession, loadSession } = await import('@/lib/client/persistence');
    const session = makeV3Session();
    saveSession(session);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.chats[0]!.messages).toHaveLength(2);
    expect(loaded!.chats[0]!.messages[0]!.content).toBe('Hello');
  });

  it('V3 session with DrawElement scene round-trips', async () => {
    const { saveSession, loadSession } = await import('@/lib/client/persistence');
    const session = makeV3Session({
      chats: [{
        id: 'c1', title: 'T', createdAt: 0, updatedAt: 0,
        messages: [],
        semanticScene: [],
        scene: [{ id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 }],
        plannerMeta: [],
      }],
    });
    saveSession(session);
    const loaded = loadSession();
    expect(loaded!.chats[0]!.scene).toHaveLength(1);
    expect((loaded!.chats[0]!.scene[0] as any).type).toBe('rect');
  });

  it('V3 session with SemanticBatch scene round-trips', async () => {
    const { saveSession, loadSession } = await import('@/lib/client/persistence');
    const session = makeV3Session({
      chats: [{
        id: 'c1', title: 'T', createdAt: 0, updatedAt: 0,
        messages: [],
        semanticScene: [{
          batch_id: 'sb1', template: 'freeform_semantic',
          blocks: [{ id: 'cap1', kind: 'caption', text: 'Note' }],
        }],
        scene: [],
        plannerMeta: [],
      }],
    });
    saveSession(session);
    const loaded = loadSession();
    expect(loaded!.chats[0]!.semanticScene).toHaveLength(1);
  });

  it('V3 session with plannerMeta diagnostics round-trips', async () => {
    const { saveSession, loadSession } = await import('@/lib/client/persistence');
    const session = makeV3Session({
      chats: [{
        id: 'c1', title: 'T', createdAt: 0, updatedAt: 0,
        messages: [],
        semanticScene: [],
        scene: [],
        plannerMeta: [{
          batchId: 'b1', violationsFixed: ['shift_x'],
          templateUsed: 'freeform_semantic', fallbackUsed: false,
        }],
      }],
    });
    saveSession(session);
    const loaded = loadSession();
    expect(loaded!.chats[0]!.plannerMeta).toHaveLength(1);
  });

  it('V3 session with panel size prefs round-trips', async () => {
    const { saveSession, loadSession } = await import('@/lib/client/persistence');
    const session = makeV3Session({ prefs: { panelSizes: [30, 70] } });
    saveSession(session);
    const loaded = loadSession();
    expect(loaded!.prefs.panelSizes).toEqual([30, 70]);
  });

  it('V2 session migrates to V3 with semanticScene stub', async () => {
    const { loadSession } = await import('@/lib/client/persistence');
    const v2 = {
      version: 2, updatedAt: Date.now(), activeChatId: 'c1',
      chats: [{
        id: 'c1', title: 'T', createdAt: 0, updatedAt: 0,
        messages: [{ id: 'm1', role: 'user', content: 'Hi', createdAt: 0 }],
        scene: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
      }],
      prefs: { panelSizes: [50, 50] },
    };
    storage[STORAGE_KEY] = JSON.stringify(v2);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.chats[0]!.semanticScene).toBeDefined();
    expect(loaded!.chats[0]!.semanticScene.length).toBeGreaterThanOrEqual(1);
  });

  it('V1 legacy session migrates to V3 with single chat', async () => {
    const { loadSession } = await import('@/lib/client/persistence');
    const v1 = {
      version: 1, updatedAt: Date.now(),
      messages: [{ id: 'm1', role: 'user', content: 'Old msg', createdAt: 0 }],
      scene: [],
      prefs: { panelSizes: [50, 50] },
    };
    storage[STORAGE_KEY] = JSON.stringify(v1);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.chats).toHaveLength(1);
    expect(loaded!.chats[0]!.messages[0]!.content).toBe('Old msg');
  });

  it('invalid JSON in storage returns null without throwing', async () => {
    const { loadSession } = await import('@/lib/client/persistence');
    storage[STORAGE_KEY] = '{not valid json';
    expect(() => loadSession()).not.toThrow();
    expect(loadSession()).toBeNull();
  });

  it('session with multiple chats preserves activeChatId', async () => {
    const { saveSession, loadSession } = await import('@/lib/client/persistence');
    const session = makeV3Session({
      activeChatId: 'chat-2',
      chats: [
        { id: 'chat-1', title: 'A', createdAt: 0, updatedAt: 0, messages: [], semanticScene: [], scene: [], plannerMeta: [] },
        { id: 'chat-2', title: 'B', createdAt: 0, updatedAt: 0, messages: [], semanticScene: [], scene: [], plannerMeta: [] },
      ],
    });
    saveSession(session);
    const loaded = loadSession();
    expect(loaded!.activeChatId).toBe('chat-2');
    expect(loaded!.chats).toHaveLength(2);
  });

  it('empty scene array persists and loads correctly', async () => {
    const { saveSession, loadSession } = await import('@/lib/client/persistence');
    const session = makeV3Session();
    saveSession(session);
    const loaded = loadSession();
    expect(loaded!.chats[0]!.scene).toEqual([]);
  });
});
