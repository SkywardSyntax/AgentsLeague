import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('iter28 · State migration chain', () => {
  let loadSession: typeof import('@/lib/client/persistence').loadSession;

  beforeEach(async () => {
    const mockStorage: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
      removeItem: (key: string) => { delete mockStorage[key]; },
    });
    // Re-import to get fresh module with mocked localStorage
    const mod = await import('@/lib/client/persistence');
    loadSession = mod.loadSession;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setStorage(data: unknown) {
    localStorage.setItem('agentsleague:session:v1', JSON.stringify(data));
  }

  const v1Session = {
    version: 1,
    updatedAt: 1700000000000,
    messages: [
      { id: 'msg1', role: 'user', content: 'Hello', createdAt: 1700000000000 },
      { id: 'msg2', role: 'assistant', content: 'Hi there', createdAt: 1700000001000 },
    ],
    scene: [{ type: 'rect', id: 'r1', x: 0, y: 0, w: 100, h: 50 }],
    prefs: { panelSizes: [50, 50] },
  };

  const v2Session = {
    version: 2,
    updatedAt: 1700000000000,
    activeChatId: 'chat-42',
    chats: [
      {
        id: 'chat-42',
        title: 'My Chat',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        messages: [{ id: 'msg1', role: 'user', content: 'Test', createdAt: 1700000000000 }],
        scene: [{ type: 'ellipse', id: 'e1', cx: 50, cy: 50, rx: 20, ry: 10 }],
      },
    ],
    prefs: { panelSizes: [60, 40] },
  };

  const v3Session = {
    version: 3,
    updatedAt: 1700000000000,
    activeChatId: 'chat-99',
    chats: [{
      id: 'chat-99',
      title: 'V3 Chat',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      messages: [{ id: 'msg1', role: 'user', content: 'V3', createdAt: 1700000000000 }],
      semanticScene: [],
      scene: [],
      plannerMeta: [],
    }],
    prefs: { panelSizes: [50, 50] },
  };

  it('V1 session migrates messages to single chat in V3', () => {
    setStorage(v1Session);
    const result = loadSession();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
    expect(result!.chats).toHaveLength(1);
    expect(result!.chats[0]!.messages).toHaveLength(2);
  });

  it('V1 session preserves all message content and roles', () => {
    setStorage(v1Session);
    const result = loadSession()!;
    expect(result.chats[0]!.messages[0]!.content).toBe('Hello');
    expect(result.chats[0]!.messages[0]!.role).toBe('user');
    expect(result.chats[0]!.messages[1]!.content).toBe('Hi there');
    expect(result.chats[0]!.messages[1]!.role).toBe('assistant');
  });

  it('V1 session preserves panel size prefs', () => {
    setStorage(v1Session);
    const result = loadSession()!;
    expect(result.prefs.panelSizes).toEqual([50, 50]);
  });

  it('V2 session migrates chats to V3 with semanticScene added', () => {
    setStorage(v2Session);
    const result = loadSession()!;
    expect(result.version).toBe(3);
    expect(result.chats[0]!.semanticScene).toBeDefined();
    expect(result.chats[0]!.semanticScene.length).toBeGreaterThan(0);
  });

  it('V2 session preserves activeChatId', () => {
    setStorage(v2Session);
    const result = loadSession()!;
    expect(result.activeChatId).toBe('chat-42');
  });

  it('V2 chats gain empty plannerMeta array', () => {
    setStorage(v2Session);
    const result = loadSession()!;
    expect(result.chats[0]!.plannerMeta).toEqual([]);
  });

  it('V2→V3 imported semantic batch has caption mentioning element count', () => {
    setStorage(v2Session);
    const result = loadSession()!;
    const semBatch = result.chats[0]!.semanticScene[0]!;
    expect(semBatch.template).toBe('freeform_semantic');
    const captionBlock = semBatch.blocks[0];
    if (captionBlock && captionBlock.kind === 'caption') {
      expect(captionBlock.text).toContain('1');
    }
  });

  it('V3 session loads without modification (passthrough)', () => {
    setStorage(v3Session);
    const result = loadSession()!;
    expect(result.version).toBe(3);
    expect(result.activeChatId).toBe('chat-99');
    expect(result.chats[0]!.title).toBe('V3 Chat');
  });

  it('V1→V3 migration creates valid chatId (non-empty)', () => {
    setStorage(v1Session);
    const result = loadSession()!;
    expect(result.activeChatId).toBeTruthy();
    expect(result.activeChatId.length).toBeGreaterThan(0);
    expect(result.chats[0]!.id).toBe(result.activeChatId);
  });

  it('migration chain V1→V3 preserves scene array contents', () => {
    setStorage(v1Session);
    const result = loadSession()!;
    expect(result.chats[0]!.scene).toHaveLength(1);
    const el = result.chats[0]!.scene[0] as Record<string, unknown>;
    expect(el.type).toBe('rect');
    expect(el.id).toBe('r1');
  });
});
