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
});
