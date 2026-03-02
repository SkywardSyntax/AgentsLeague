import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PersistedSessionV3 } from '@/lib/client/persistence';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
  clear: vi.fn(() => storage.clear()),
  get length() { return storage.size; },
  key: vi.fn(() => null),
};

vi.stubGlobal('localStorage', localStorageMock);

const STORAGE_KEY = 'agentsleague:session:v1';

function makeValidSession(overrides?: Partial<PersistedSessionV3>): PersistedSessionV3 {
  return {
    version: 3,
    updatedAt: Date.now(),
    activeChatId: 'chat-1',
    chats: [
      {
        id: 'chat-1',
        title: 'Chat 1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        semanticScene: [],
        scene: [],
        plannerMeta: [],
      },
    ],
    prefs: { panelSizes: [62, 38] },
    ...overrides,
  };
}

describe('session restore guards', () => {
  let loadSession: typeof import('@/lib/client/persistence').loadSession;
  let saveSession: typeof import('@/lib/client/persistence').saveSession;

  beforeEach(async () => {
    storage.clear();
    vi.clearAllMocks();
    const mod = await import('@/lib/client/persistence');
    loadSession = mod.loadSession;
    saveSession = mod.saveSession;
  });

  it('loadSession returns null when localStorage is empty', () => {
    expect(loadSession()).toBeNull();
  });

  it('loadSession returns null and clears storage when data is corrupted', () => {
    storage.set(STORAGE_KEY, 'not-json');
    expect(loadSession()).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('loadSession returns null and clears storage when schema is invalid', () => {
    storage.set(STORAGE_KEY, JSON.stringify({ version: 99, garbage: true }));
    expect(loadSession()).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('loadSession restores valid V3 data', () => {
    const session = makeValidSession();
    storage.set(STORAGE_KEY, JSON.stringify(session));
    const restored = loadSession();
    expect(restored).not.toBeNull();
    expect(restored!.chats).toHaveLength(1);
    expect(restored!.activeChatId).toBe('chat-1');
  });

  it('activeChatId pointing to non-existent chat still loads — caller handles fallback', () => {
    const session = makeValidSession({ activeChatId: 'nonexistent-id' });
    storage.set(STORAGE_KEY, JSON.stringify(session));
    const restored = loadSession();
    expect(restored).not.toBeNull();
    expect(restored!.activeChatId).toBe('nonexistent-id');
    expect(restored!.chats[0]!.id).toBe('chat-1');
  });

  it('saveSession followed by loadSession round-trips correctly', () => {
    const session = makeValidSession();
    saveSession(session);
    const restored = loadSession();
    expect(restored).not.toBeNull();
    expect(restored!.chats[0]!.id).toBe(session.chats[0]!.id);
  });

  it('V2 data is migrated to V3 on load', () => {
    const v2 = {
      version: 2,
      updatedAt: Date.now(),
      activeChatId: 'chat-v2',
      chats: [
        {
          id: 'chat-v2',
          title: 'V2 Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          scene: [],
        },
      ],
      prefs: { panelSizes: [62, 38] },
    };
    storage.set(STORAGE_KEY, JSON.stringify(v2));
    const restored = loadSession();
    expect(restored).not.toBeNull();
    expect(restored!.chats[0]!.semanticScene).toBeDefined();
    expect(restored!.chats[0]!.plannerMeta).toBeDefined();
  });
});
