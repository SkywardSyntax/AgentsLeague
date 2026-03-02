import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSession, saveSession, type PersistedSessionV3 } from '../client/persistence';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    for (const key in store) delete store[key];
  }),
  get length() {
    return Object.keys(store).length;
  },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
};

const STORAGE_KEY = 'agentsleague:session:v1';

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal('localStorage', localStorageMock);
});

describe('persistence-corrupt: loadSession error recovery with corrupt/malformed data', () => {
  it('non-JSON string in localStorage → returns null and removes key', () => {
    localStorage.setItem(STORAGE_KEY, 'not json at all');
    const result = loadSession();
    expect(result).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('valid JSON but wrong shape → returns null and removes key', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, data: 'unknown' }));
    const result = loadSession();
    expect(result).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('V3 with missing required field (no activeChatId) → returns null', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        updatedAt: Date.now(),
        chats: [],
        prefs: { panelSizes: [60, 40] },
      }),
    );
    const result = loadSession();
    expect(result).toBeNull();
  });

  it('V2 valid data → migrates to V3 successfully', () => {
    const v2Data = {
      version: 2,
      updatedAt: Date.now(),
      activeChatId: 'c1',
      chats: [
        {
          id: 'c1',
          title: 'T1',
          createdAt: 1,
          updatedAt: 2,
          messages: [],
          scene: [],
        },
      ],
      prefs: { panelSizes: [60, 40] },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2Data));
    const result = loadSession();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
    expect(result!.chats[0]!.semanticScene).toBeDefined();
  });

  it('V1 valid data → migrates to V3 successfully', () => {
    const v1Data = {
      version: 1,
      updatedAt: Date.now(),
      messages: [],
      scene: [],
      prefs: { panelSizes: [62, 38] },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1Data));
    const result = loadSession();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
  });

  it('saveSession → loadSession roundtrip preserves data', () => {
    const session: PersistedSessionV3 = {
      version: 3,
      updatedAt: 1700000000000,
      activeChatId: 'rt-chat',
      chats: [
        {
          id: 'rt-chat',
          title: 'Roundtrip Chat',
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          messages: [
            { id: 'rt-m1', role: 'user', content: 'roundtrip test', createdAt: 1700000000000 },
            { id: 'rt-m2', role: 'assistant', content: 'confirmed', createdAt: 1700000000001 },
          ],
          semanticScene: [{ batch_id: 'b1', template: 'freeform_semantic', intent: 'summarize', blocks: [] }],
          scene: [],
          plannerMeta: [],
        },
      ],
      prefs: { panelSizes: [55, 45] },
    };
    saveSession(session);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(session.version);
    expect(loaded!.updatedAt).toBe(session.updatedAt);
    expect(loaded!.activeChatId).toBe(session.activeChatId);
    expect(loaded!.chats).toHaveLength(1);
    expect(loaded!.chats[0].id).toBe('rt-chat');
    expect(loaded!.chats[0].title).toBe('Roundtrip Chat');
    expect(loaded!.chats[0].messages).toHaveLength(2);
    expect(loaded!.chats[0].messages[0].content).toBe('roundtrip test');
    expect(loaded!.chats[0].messages[1].content).toBe('confirmed');
    expect(loaded!.chats[0].semanticScene).toHaveLength(1);
    expect(loaded!.chats[0].semanticScene[0].batch_id).toBe('b1');
    expect(loaded!.prefs).toEqual({ panelSizes: [55, 45] });
  });
});
