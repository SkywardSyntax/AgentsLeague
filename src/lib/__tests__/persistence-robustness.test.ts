import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadSession, saveSession, type PersistedSessionV3 } from '../client/persistence';

const STORAGE_KEY = 'agentsleague:session:v1';

// ── localStorage mock ──────────────────────────────────────────────────

function createStorageMock(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function makeMessage(id: string, role: 'user' | 'assistant' | 'system' = 'user') {
  return { id, role, content: `msg ${id}`, createdAt: Date.now() };
}

function makeV3Session(overrides?: Partial<PersistedSessionV3>): PersistedSessionV3 {
  return {
    version: 3,
    updatedAt: Date.now(),
    activeChatId: 'chat-1',
    chats: [
      {
        id: 'chat-1',
        title: 'Test Chat',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [makeMessage('m1')],
        semanticScene: [],
        scene: [],
        plannerMeta: [],
      },
    ],
    prefs: { panelSizes: [50, 50] },
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('persistence robustness', () => {
  let origLocalStorage: Storage;

  beforeEach(() => {
    origLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorageMock(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: origLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  // 1
  it('loadSession returns null when localStorage is empty', () => {
    expect(loadSession()).toBeNull();
  });

  // 2
  it('loadSession returns null and removes key when JSON is invalid', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, '{{{broken}}}');
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    consoleSpy.mockRestore();
  });

  // 3
  it('loadSession returns null for valid JSON but invalid schema', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, foo: 'bar' }));
    expect(loadSession()).toBeNull();
    consoleSpy.mockRestore();
  });

  // 4
  it('loadSession correctly parses a valid V3 session', () => {
    const session = makeV3Session({
      activeChatId: 'chat-1',
      chats: [
        {
          id: 'chat-1',
          title: 'Alpha',
          createdAt: 100,
          updatedAt: 200,
          messages: [makeMessage('m1'), makeMessage('m2')],
          semanticScene: [],
          scene: [],
          plannerMeta: [],
        },
        {
          id: 'chat-2',
          title: 'Beta',
          createdAt: 300,
          updatedAt: 400,
          messages: [makeMessage('m3')],
          semanticScene: [],
          scene: [],
          plannerMeta: [],
        },
      ],
    });

    saveSession(session);
    const loaded = loadSession();

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.activeChatId).toBe('chat-1');
    expect(loaded!.chats).toHaveLength(2);
    expect(loaded!.chats[0]!.messages).toHaveLength(2);
    expect(loaded!.chats[1]!.messages).toHaveLength(1);
  });

  // 5
  it('loadSession migrates V2 to V3 preserving all messages', () => {
    const v2 = {
      version: 2,
      updatedAt: 5000,
      activeChatId: 'c1',
      chats: [
        {
          id: 'c1',
          title: 'V2 Chat',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [makeMessage('m1'), makeMessage('m2'), makeMessage('m3')],
          scene: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
        },
      ],
      prefs: { panelSizes: [50, 50] as [number, number] },
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2));
    const loaded = loadSession();

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.chats[0]!.messages).toHaveLength(3);
    expect(loaded!.chats[0]!.semanticScene).toHaveLength(1);
    expect(loaded!.chats[0]!.plannerMeta).toEqual([]);
  });

  // 6
  it('loadSession migrates V1 to V3 creating single chat', () => {
    const v1 = {
      version: 1,
      updatedAt: 1000,
      messages: [makeMessage('m1'), makeMessage('m2')],
      scene: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 5, h: 5 }],
      prefs: { panelSizes: [40, 60] as [number, number] },
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1));
    const loaded = loadSession();

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.chats).toHaveLength(1);
    expect(loaded!.chats[0]!.messages).toHaveLength(2);
    expect(loaded!.chats[0]!.messages[0]!.id).toBe('m1');
    expect(loaded!.activeChatId).toBe(loaded!.chats[0]!.id);
  });

  // 7
  it('saveSession round-trips with loadSession', () => {
    const session = makeV3Session({
      chats: [
        {
          id: 'chat-rt',
          title: 'Round Trip',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [makeMessage('m1'), makeMessage('m2', 'assistant')],
          semanticScene: [],
          scene: [],
          plannerMeta: [],
        },
      ],
      activeChatId: 'chat-rt',
    });

    saveSession(session);
    const loaded = loadSession();

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(session.version);
    expect(loaded!.activeChatId).toBe(session.activeChatId);
    expect(loaded!.chats).toHaveLength(session.chats.length);
    expect(loaded!.chats[0]!.id).toBe(session.chats[0]!.id);
    expect(loaded!.chats[0]!.messages).toEqual(session.chats[0]!.messages);
    expect(loaded!.prefs).toEqual(session.prefs);
  });

  // 8
  it('loadSession handles localStorage.getItem throwing SecurityError', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const origGetItem = localStorage.getItem;
    localStorage.getItem = () => {
      throw new DOMException('quota exceeded', 'SecurityError');
    };
    // Also prevent removeItem from throwing so the catch block works
    const origRemoveItem = localStorage.removeItem;
    localStorage.removeItem = () => {};

    const loaded = loadSession();
    expect(loaded).toBeNull();

    localStorage.getItem = origGetItem;
    localStorage.removeItem = origRemoveItem;
    consoleSpy.mockRestore();
  });

  // 9
  it('loadSession handles corrupt chat entry within valid V3 envelope', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = {
      version: 3,
      updatedAt: Date.now(),
      activeChatId: 'chat-1',
      chats: [
        {
          id: 'chat-1',
          title: 'Test',
          createdAt: 1000,
          updatedAt: 2000,
          messages: 'not-an-array', // corrupt
          semanticScene: [],
          scene: [],
          plannerMeta: [],
        },
      ],
      prefs: { panelSizes: [50, 50] },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
    const loaded = loadSession();
    expect(loaded).toBeNull();
    // Verify key was not left behind (V3 parse fails, no other version matches)
    // The error logger should have been called
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  // 10
  it('V2→V3 migration adds importedLegacySemanticBatch with correct element count', () => {
    const v2 = {
      version: 2,
      updatedAt: 3000,
      activeChatId: 'c1',
      chats: [
        {
          id: 'c1',
          title: 'Five Elements',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [],
          scene: [
            { id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10 },
            { id: 'e2', type: 'rect', x: 20, y: 0, w: 10, h: 10 },
            { id: 'e3', type: 'rect', x: 40, y: 0, w: 10, h: 10 },
            { id: 'e4', type: 'rect', x: 60, y: 0, w: 10, h: 10 },
            { id: 'e5', type: 'rect', x: 80, y: 0, w: 10, h: 10 },
          ],
        },
      ],
      prefs: { panelSizes: [50, 50] as [number, number] },
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2));
    const loaded = loadSession();

    expect(loaded).not.toBeNull();
    const chat = loaded!.chats[0]!;
    expect(chat.semanticScene).toHaveLength(1);
    const batch = chat.semanticScene[0]!;
    expect(batch.blocks).toHaveLength(1);
    const block = batch.blocks[0]!;
    expect(block.kind).toBe('caption');
    if (block.kind === 'caption') {
      expect(block.text).toContain('5 elements');
    }
  });
});
