import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSession, saveSession, type PersistedSessionV3 } from '../client/persistence';

// Mock localStorage
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

function makeV3Session(overrides?: Partial<PersistedSessionV3>): PersistedSessionV3 {
  return {
    version: 3,
    updatedAt: 1000,
    activeChatId: 'chat-1',
    chats: [
      {
        id: 'chat-1',
        title: 'Test Chat',
        createdAt: 1000,
        updatedAt: 1000,
        messages: [
          { id: 'msg-1', role: 'user', content: 'hello', createdAt: 1000 },
        ],
        semanticScene: [],
        scene: [],
        plannerMeta: [],
      },
    ],
    prefs: { panelSizes: [40, 60] },
    ...overrides,
  };
}

describe('saveSession + loadSession roundtrip', () => {
  it('saves and loads a V3 session correctly', () => {
    const session = makeV3Session();
    saveSession(session);
    const loaded = loadSession();
    expect(loaded).toEqual(session);
  });

  it('preserves all message fields', () => {
    const session = makeV3Session({
      chats: [
        {
          id: 'c1',
          title: 'Chat',
          createdAt: 100,
          updatedAt: 200,
          messages: [
            { id: 'm1', role: 'user', content: 'question', createdAt: 100 },
            { id: 'm2', role: 'assistant', content: 'answer', createdAt: 150 },
          ],
          semanticScene: [],
          scene: [],
          plannerMeta: [],
        },
      ],
    });
    saveSession(session);
    const loaded = loadSession();
    expect(loaded!.chats[0].messages).toHaveLength(2);
    expect(loaded!.chats[0].messages[1].role).toBe('assistant');
  });
});

describe('loadSession returns null', () => {
  it('returns null when localStorage is empty', () => {
    expect(loadSession()).toBeNull();
  });

  it('removes corrupted data and returns null', () => {
    store[STORAGE_KEY] = '{invalid json!!!';
    expect(loadSession()).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('removes data that fails all schema validations', () => {
    store[STORAGE_KEY] = JSON.stringify({ version: 99, randomField: true });
    expect(loadSession()).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });
});

describe('loadSession migrates V1 → V3', () => {
  it('migrates legacy V1 format to V3', () => {
    const v1 = {
      version: 1,
      updatedAt: 500,
      messages: [
        { id: 'lm1', role: 'user', content: 'old message', createdAt: 500 },
      ],
      scene: [{ id: 'el-1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
      prefs: { panelSizes: [50, 50] },
    };
    store[STORAGE_KEY] = JSON.stringify(v1);
    const loaded = loadSession();

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.chats).toHaveLength(1);
    expect(loaded!.chats[0].messages).toHaveLength(1);
    expect(loaded!.chats[0].messages[0].content).toBe('old message');
    expect(loaded!.chats[0].scene).toHaveLength(1);
    expect(loaded!.chats[0].semanticScene).toHaveLength(1);
    expect(loaded!.chats[0].semanticScene[0].batch_id).toContain('imported-');
    expect(loaded!.chats[0].title).toBe('Chat 1');
    expect(loaded!.prefs).toEqual({ panelSizes: [50, 50] });
  });
});

describe('loadSession migrates V2 → V3', () => {
  it('migrates V2 format to V3 with semanticScene added', () => {
    const v2 = {
      version: 2,
      updatedAt: 700,
      activeChatId: 'v2-chat',
      chats: [
        {
          id: 'v2-chat',
          title: 'V2 Chat',
          createdAt: 700,
          updatedAt: 700,
          messages: [
            { id: 'v2m1', role: 'user', content: 'v2 message', createdAt: 700 },
          ],
          scene: [{ id: 'v2-el', type: 'rect', x: 0, y: 0, w: 20, h: 20 }],
        },
      ],
      prefs: { panelSizes: [45, 55] },
    };
    store[STORAGE_KEY] = JSON.stringify(v2);
    const loaded = loadSession();

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.chats[0].semanticScene).toHaveLength(1);
    expect(loaded!.chats[0].semanticScene[0].batch_id).toContain('imported-');
    expect(loaded!.chats[0].plannerMeta).toEqual([]);
    expect(loaded!.activeChatId).toBe('v2-chat');
  });
});

describe('saveSession SSR safety', () => {
  it('loadSession returns null when window is undefined', () => {
    // Simulate SSR by temporarily removing window
    const origWindow = globalThis.window;
    // @ts-expect-error - testing SSR scenario
    delete globalThis.window;
    expect(loadSession()).toBeNull();
    globalThis.window = origWindow;
  });
});

describe('loadSession migration edge cases', () => {
  it('handles V2 with empty chat title gracefully', () => {
    const v2 = {
      version: 2,
      updatedAt: 800,
      activeChatId: 'c-empty',
      chats: [
        {
          id: 'c-empty',
          title: '',
          createdAt: 800,
          updatedAt: 800,
          messages: [
            { id: 'm1', role: 'user', content: 'test', createdAt: 800 },
          ],
          scene: [],
        },
      ],
      prefs: { panelSizes: [50, 50] },
    };
    store[STORAGE_KEY] = JSON.stringify(v2);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.chats[0].title).toBe('');
    expect(loaded!.chats[0].semanticScene).toHaveLength(1);
  });

  it('handles V1 with empty messages array', () => {
    const v1 = {
      version: 1,
      updatedAt: 900,
      messages: [],
      scene: [],
      prefs: { panelSizes: [50, 50] },
    };
    store[STORAGE_KEY] = JSON.stringify(v1);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.chats).toHaveLength(1);
    expect(loaded!.chats[0].messages).toHaveLength(0);
  });

  it('handles V3 with extra unknown fields via passthrough', () => {
    const v3WithExtra = {
      version: 3,
      updatedAt: 1000,
      activeChatId: 'cx',
      someUnknownField: 'should be stripped by zod',
      chats: [
        {
          id: 'cx',
          title: 'Extra fields chat',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1000 }],
          semanticScene: [],
          scene: [],
          plannerMeta: [],
          extraNested: true,
        },
      ],
      prefs: { panelSizes: [40, 60] },
    };
    store[STORAGE_KEY] = JSON.stringify(v3WithExtra);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.chats[0].title).toBe('Extra fields chat');
  });

  it('removes data and returns null on structurally invalid V3', () => {
    // Valid JSON, but chats has wrong inner structure (missing required fields)
    const bad = {
      version: 3,
      updatedAt: 1000,
      activeChatId: 'c1',
      chats: [{ id: 'c1' }], // missing title, messages, etc.
      prefs: { panelSizes: [50, 50] },
    };
    store[STORAGE_KEY] = JSON.stringify(bad);
    const loaded = loadSession();
    expect(loaded).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });
});
