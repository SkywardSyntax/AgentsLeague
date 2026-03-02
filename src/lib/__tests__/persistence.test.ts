import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadSession, saveSession, type PersistedSessionV3 } from '../client/persistence';

// ── HEAD helpers ───────────────────────────────────────────────────────

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
        messages: [],
        semanticScene: [],
        scene: [],
        plannerMeta: [],
      },
    ],
    prefs: { panelSizes: [50, 50] },
    ...overrides,
  };
}

const STORAGE_KEY = 'agentsleague:session:v1';

// In-memory localStorage mock for test isolation
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

describe('persistence', () => {
  let origLocalStorage: Storage;

  beforeEach(() => {
    origLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: createStorageMock(), writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: origLocalStorage, writable: true, configurable: true });
  });

  describe('warnings round-trip', () => {
    it('V3 session with warnings field round-trips correctly', () => {
      const session = makeV3Session({
        chats: [
          {
            id: 'chat-1',
            title: 'Test',
            createdAt: 1000,
            updatedAt: 2000,
            messages: [],
            semanticScene: [],
            scene: [],
            plannerMeta: [],
            warnings: ['warn1', 'warn2'],
          },
        ],
      });
      saveSession(session);
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.chats[0]!.warnings).toEqual(['warn1', 'warn2']);
    });

    it('V3 session without warnings field loads successfully', () => {
      const session = makeV3Session();
      saveSession(session);
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.chats[0]!.warnings).toBeUndefined();
    });

    it('sanitizeSession clamps warnings to 8 entries', () => {
      const warnings = Array.from({ length: 12 }, (_, i) => `warning-${i}`);
      const session = makeV3Session({
        chats: [
          {
            id: 'chat-1',
            title: 'Test',
            createdAt: 1000,
            updatedAt: 2000,
            messages: [],
            semanticScene: [],
            scene: [],
            plannerMeta: [],
            warnings,
          },
        ],
      });
      saveSession(session);
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.chats[0]!.warnings).toHaveLength(8);
      expect(loaded!.chats[0]!.warnings![0]).toBe('warning-4');
      expect(loaded!.chats[0]!.warnings![7]).toBe('warning-11');
    });
  });

  describe('saveSession', () => {
    it('handles quota exceeded gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const origSetItem = localStorage.setItem;
      localStorage.setItem = () => { throw new DOMException('QuotaExceededError'); };
      expect(() => saveSession(makeV3Session())).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('quota'),
        expect.anything(),
      );
      localStorage.setItem = origSetItem;
      consoleSpy.mockRestore();
    });
  });

  describe('large payload resilience', () => {
    it('round-trips a session with 500 messages', () => {
      const messages = Array.from({ length: 500 }, (_, i) => ({
        id: `msg-${i}`,
        role: 'user' as const,
        content: `Message number ${i} with some content padding`,
        createdAt: 1000 + i,
      }));
      const session = makeV3Session({
        chats: [
          {
            id: 'chat-1',
            title: 'Big Chat',
            createdAt: 1000,
            updatedAt: 2000,
            messages,
            semanticScene: [],
            scene: [],
            plannerMeta: [],
          },
        ],
      });
      saveSession(session);
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.chats[0]!.messages).toHaveLength(500);
      expect(loaded!.chats[0]!.messages[499]!.id).toBe('msg-499');
    });
  });

  describe('concurrent save/load', () => {
    it('latest save wins on subsequent load', () => {
      const sessionA = makeV3Session({ activeChatId: 'chat-a', chats: [{ id: 'chat-a', title: 'A', createdAt: 1000, updatedAt: 2000, messages: [], semanticScene: [], scene: [], plannerMeta: [] }] });
      const sessionB = makeV3Session({ activeChatId: 'chat-b', chats: [{ id: 'chat-b', title: 'B', createdAt: 1000, updatedAt: 3000, messages: [], semanticScene: [], scene: [], plannerMeta: [] }] });
      saveSession(sessionA);
      saveSession(sessionB);
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.activeChatId).toBe('chat-b');
    });
  });

  describe('localStorage.getItem failure', () => {
    it('returns null when getItem throws', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const origGetItem = localStorage.getItem;
      localStorage.getItem = () => { throw new DOMException('SecurityError'); };
      const loaded = loadSession();
      expect(loaded).toBeNull();
      localStorage.getItem = origGetItem;
      consoleSpy.mockRestore();
    });
  });

  describe('corrupted JSON', () => {
    it('returns null for invalid JSON', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('agentsleague:session:v1', '{not valid json');
      const loaded = loadSession();
      expect(loaded).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs structured warning and clears storage key on invalid JSON', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, '%%%not-json%%%');
      const loaded = loadSession();
      expect(loaded).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[persistence] Failed to load session; clearing storage.',
        expect.any(String),
      );
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('V1 → V3 migration', () => {
    it('migrates V1 blob to V3 with semanticScene and plannerMeta', () => {
      const v1 = {
        version: 1,
        updatedAt: 1000,
        messages: [
          { id: 'msg-1', role: 'user', content: 'hello', createdAt: 500 },
        ],
        scene: [
          { id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 },
        ],
        prefs: { panelSizes: [50, 50] },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v1));
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe(3);
      expect(loaded!.chats).toHaveLength(1);
      const chat = loaded!.chats[0]!;
      expect(chat.messages).toEqual(v1.messages);
      expect(chat.plannerMeta).toEqual([]);
      expect(chat.semanticScene).toHaveLength(1);
      expect(chat.semanticScene[0]!.batch_id).toMatch(/^imported-/);
      expect(chat.semanticScene[0]!.template).toBe('freeform_semantic');
      expect(chat.semanticScene[0]!.blocks).toHaveLength(1);
      const block = chat.semanticScene[0]!.blocks[0]!;
      expect(block.kind).toBe('caption');
      if (block.kind === 'caption') {
        expect(block.text).toContain('1 elements');
      }
      expect(chat.title).toBe('Chat 1');
      expect(loaded!.activeChatId).toBe(chat.id);
    });

    it('creates backup before V1 migration', () => {
      const v1 = {
        version: 1,
        updatedAt: 2000,
        messages: [],
        scene: [],
        prefs: { panelSizes: [40, 60] },
      };
      const raw = JSON.stringify(v1);
      localStorage.setItem(STORAGE_KEY, raw);
      loadSession();
      expect(localStorage.getItem('agentsleague:session:backup')).toBe(raw);
    });
  });

  describe('V2 → V3 migration', () => {
    it('migrates V2 blob adding semanticScene and plannerMeta', () => {
      const v2 = {
        version: 2,
        updatedAt: 3000,
        activeChatId: 'chat-a',
        chats: [
          {
            id: 'chat-a',
            title: 'My Chat',
            createdAt: 1000,
            updatedAt: 2000,
            messages: [{ id: 'm1', role: 'user', content: 'test', createdAt: 1000 }],
            scene: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 5, h: 5 }],
          },
          {
            id: 'chat-b',
            title: 'Second',
            createdAt: 1500,
            updatedAt: 2500,
            messages: [],
            scene: [],
          },
        ],
        prefs: { panelSizes: [60, 40] },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v2));
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe(3);
      expect(loaded!.activeChatId).toBe('chat-a');
      expect(loaded!.chats).toHaveLength(2);

      const chatA = loaded!.chats[0]!;
      expect(chatA.plannerMeta).toEqual([]);
      expect(chatA.semanticScene).toHaveLength(1);
      expect(chatA.semanticScene[0]!.batch_id).toMatch(/^imported-chat-a$/);
      const blockA = chatA.semanticScene[0]!.blocks[0]!;
      expect(blockA.kind).toBe('caption');
      if (blockA.kind === 'caption') expect(blockA.text).toContain('1 elements');

      const chatB = loaded!.chats[1]!;
      expect(chatB.plannerMeta).toEqual([]);
      expect(chatB.semanticScene).toHaveLength(1);
      const blockB = chatB.semanticScene[0]!.blocks[0]!;
      expect(blockB.kind).toBe('caption');
      if (blockB.kind === 'caption') expect(blockB.text).toContain('0 elements');
    });

    it('creates backup before V2 migration', () => {
      const v2 = {
        version: 2,
        updatedAt: 1000,
        activeChatId: 'c1',
        chats: [{ id: 'c1', title: 'X', createdAt: 1, updatedAt: 2, messages: [], scene: [] }],
        prefs: { panelSizes: [50, 50] },
      };
      const raw = JSON.stringify(v2);
      localStorage.setItem(STORAGE_KEY, raw);
      loadSession();
      expect(localStorage.getItem('agentsleague:session:backup')).toBe(raw);
    });
  });

  describe('scene array primitive rejection', () => {
    it('returns null when V3 scene contains primitives instead of objects', () => {
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
            messages: [],
            semanticScene: [],
            scene: [42, 'bad', null],
            plannerMeta: [],
          },
        ],
        prefs: { panelSizes: [50, 50] },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
      const loaded = loadSession();
      expect(loaded).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null when V3 semanticScene contains primitives', () => {
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
            messages: [],
            semanticScene: [99, false],
            scene: [],
            plannerMeta: [],
          },
        ],
        prefs: { panelSizes: [50, 50] },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
      const loaded = loadSession();
      expect(loaded).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null when V3 plannerMeta contains primitives', () => {
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
            messages: [],
            semanticScene: [],
            scene: [],
            plannerMeta: ['not-an-object'],
          },
        ],
        prefs: { panelSizes: [50, 50] },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
      const loaded = loadSession();
      expect(loaded).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null when V2 scene contains primitives', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const bad = {
        version: 2,
        updatedAt: 1000,
        activeChatId: 'c1',
        chats: [{ id: 'c1', title: 'X', createdAt: 1, updatedAt: 2, messages: [], scene: [42, null] }],
        prefs: { panelSizes: [50, 50] },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
      const loaded = loadSession();
      expect(loaded).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null when V1 scene contains primitives', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const bad = {
        version: 1,
        updatedAt: 1000,
        messages: [],
        scene: ['bad', 123],
        prefs: { panelSizes: [50, 50] },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
      const loaded = loadSession();
      expect(loaded).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('unrecognized schema', () => {
    it('returns null for wrong version number', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, foo: 'bar' }));
      const loaded = loadSession();
      expect(loaded).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No schema matched'));
      consoleSpy.mockRestore();
    });
  });
});

// ── Lane-07 tests ──────────────────────────────────────────────────────

describe('persistence (lane-07)', () => {
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

  function makeV3SessionLane07(overrides?: Partial<PersistedSessionV3>): PersistedSessionV3 {
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

  beforeEach(() => {
    localStorageMock.clear();
    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveSession + loadSession roundtrip', () => {
    it('saves and loads a V3 session correctly', () => {
      const session = makeV3SessionLane07();
      saveSession(session);
      const loaded = loadSession();
      expect(loaded).toEqual(session);
    });

    it('preserves all message fields', () => {
      const session = makeV3SessionLane07({
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
      const bad = {
        version: 3,
        updatedAt: 1000,
        activeChatId: 'c1',
        chats: [{ id: 'c1' }],
        prefs: { panelSizes: [50, 50] },
      };
      store[STORAGE_KEY] = JSON.stringify(bad);
      const loaded = loadSession();
      expect(loaded).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });

  describe('loadSession with corrupted inner data (typed array validation)', () => {
    it('returns null when semanticScene contains non-objects', () => {
      const data = {
        version: 3,
        updatedAt: 1000,
        activeChatId: 'c1',
        chats: [
          {
            id: 'c1',
            title: 'Test',
            createdAt: 1000,
            updatedAt: 1000,
            messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1000 }],
            semanticScene: [42, 'hello', null],
            scene: [],
            plannerMeta: [],
          },
        ],
        prefs: { panelSizes: [40, 60] },
      };
      store[STORAGE_KEY] = JSON.stringify(data);
      const loaded = loadSession();
      expect(loaded).toBeNull();
    });

    it('returns null when scene elements lack required id/type', () => {
      const data = {
        version: 3,
        updatedAt: 1000,
        activeChatId: 'c1',
        chats: [
          {
            id: 'c1',
            title: 'Test',
            createdAt: 1000,
            updatedAt: 1000,
            messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1000 }],
            semanticScene: [],
            scene: [{ color: 'red' }],
            plannerMeta: [],
          },
        ],
        prefs: { panelSizes: [40, 60] },
      };
      store[STORAGE_KEY] = JSON.stringify(data);
      const loaded = loadSession();
      expect(loaded).toBeNull();
    });

    it('returns null for completely invalid JSON in localStorage', () => {
      store[STORAGE_KEY] = '!!!not-json{{{';
      const loaded = loadSession();
      expect(loaded).toBeNull();
    });

    it('preserves valid semanticScene with extra fields (passthrough)', () => {
      const data = {
        version: 3,
        updatedAt: 1000,
        activeChatId: 'c1',
        chats: [
          {
            id: 'c1',
            title: 'Test',
            createdAt: 1000,
            updatedAt: 1000,
            messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1000 }],
            semanticScene: [{ batch_id: 'b1', template: 'freeform', blocks: [], extra_field: true }],
            scene: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 100, h: 50, custom: 'data' }],
            plannerMeta: [{ batchId: 'b1', rows: 3 }],
          },
        ],
        prefs: { panelSizes: [40, 60] },
      };
      store[STORAGE_KEY] = JSON.stringify(data);
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.chats[0].semanticScene).toHaveLength(1);
      expect(loaded!.chats[0].semanticScene[0]).toHaveProperty('batch_id', 'b1');
      expect(loaded!.chats[0].semanticScene[0]).toHaveProperty('extra_field', true);
      expect(loaded!.chats[0].scene).toHaveLength(1);
      expect(loaded!.chats[0].scene[0]).toHaveProperty('custom', 'data');
      expect(loaded!.chats[0].plannerMeta).toHaveLength(1);
      expect(loaded!.chats[0].plannerMeta[0]).toHaveProperty('rows', 3);
    });

    it('returns null when plannerMeta contains non-object entries', () => {
      const data = {
        version: 3,
        updatedAt: 1000,
        activeChatId: 'c1',
        chats: [
          {
            id: 'c1',
            title: 'Test',
            createdAt: 1000,
            updatedAt: 1000,
            messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1000 }],
            semanticScene: [],
            scene: [],
            plannerMeta: [null, undefined, 123],
          },
        ],
        prefs: { panelSizes: [40, 60] },
      };
      store[STORAGE_KEY] = JSON.stringify(data);
      const loaded = loadSession();
      expect(loaded).toBeNull();
    });

    it('V2 migration produces valid V3 with typed arrays', () => {
      const v2 = {
        version: 2,
        updatedAt: 700,
        activeChatId: 'v2c',
        chats: [
          {
            id: 'v2c',
            title: 'V2 Chat',
            createdAt: 700,
            updatedAt: 700,
            messages: [{ id: 'm1', role: 'user', content: 'msg', createdAt: 700 }],
            scene: [{ id: 'e1', type: 'rect', x: 0, y: 0 }],
          },
        ],
        prefs: { panelSizes: [50, 50] },
      };
      store[STORAGE_KEY] = JSON.stringify(v2);
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe(3);
      expect(loaded!.chats[0].semanticScene).toHaveLength(1);
      expect(loaded!.chats[0].semanticScene[0].batch_id).toContain('imported-');
      expect(loaded!.chats[0].plannerMeta).toEqual([]);
    });
  });

  describe('persistence resilience', () => {
    it('saveSession does not throw when localStorage.setItem throws QuotaExceededError', () => {
      const origSetItem = localStorageMock.setItem;
      localStorageMock.setItem = vi.fn(() => {
        throw new DOMException('QuotaExceededError');
      });
      vi.stubGlobal('localStorage', localStorageMock);

      const session = makeV3SessionLane07();
      expect(() => saveSession(session)).not.toThrow();

      localStorageMock.setItem = origSetItem;
    });

    it('loadSession returns null when localStorage.getItem throws', () => {
      const origGetItem = localStorageMock.getItem;
      try {
        localStorageMock.getItem = vi.fn(() => {
          throw new DOMException('SecurityError');
        });
        vi.stubGlobal('localStorage', localStorageMock);

        expect(loadSession()).toBeNull();
      } finally {
        localStorageMock.getItem = origGetItem;
        vi.stubGlobal('localStorage', localStorageMock);
      }
    });

    it('roundtrips a session with 500 messages without corruption', () => {
      const messages = Array.from({ length: 500 }, (_, i) => ({
        id: `msg-${i}`,
        role: 'user' as const,
        content: `Message content ${i} with some padding to simulate real data`,
        createdAt: 1000 + i,
      }));
      const session = makeV3SessionLane07({
        chats: [
          {
            id: 'big-chat',
            title: 'Large Chat',
            createdAt: 1000,
            updatedAt: 2000,
            messages,
            semanticScene: [],
            scene: [],
            plannerMeta: [],
          },
        ],
      });

      saveSession(session);
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.chats[0].messages).toHaveLength(500);
      expect(loaded!.chats[0].messages[0].id).toBe('msg-0');
      expect(loaded!.chats[0].messages[499].id).toBe('msg-499');
    });

    it('consecutive saves: last save wins on load', () => {
      const sessionA = makeV3SessionLane07({ activeChatId: 'chat-a' });
      const sessionB = makeV3SessionLane07({ activeChatId: 'chat-b' });

      saveSession(sessionA);
      saveSession(sessionB);
      const loaded = loadSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.activeChatId).toBe('chat-b');
    });

    it('saveSession is a no-op when window is undefined (SSR safety)', () => {
      const origWindow = globalThis.window;
      // @ts-expect-error - testing SSR scenario
      delete globalThis.window;

      const session = makeV3SessionLane07();
      expect(() => saveSession(session)).not.toThrow();

      globalThis.window = origWindow;
    });
  });
});
