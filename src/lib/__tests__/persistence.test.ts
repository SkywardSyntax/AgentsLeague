import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadSession, saveSession, type PersistedSessionV3 } from '../client/persistence';

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
      // warnings is undefined when not present in persisted data
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
      // Should keep the last 8
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
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem('agentsleague:session:v1', '{not valid json');
      const loaded = loadSession();
      expect(loaded).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
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
