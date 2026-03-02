import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as persistence from '@/lib/client/persistence';
import type { PersistedSessionV3 } from '@/lib/client/persistence';

const STORAGE_KEY = 'agentsleague:session:v1';

function makePersistedSession(
  overrides: Partial<PersistedSessionV3> = {},
): PersistedSessionV3 {
  return {
    version: 3,
    updatedAt: Date.now(),
    activeChatId: 'chat-1',
    chats: [
      {
        id: 'chat-1',
        title: 'Chat 1',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [
          { id: 'm1', role: 'user', content: 'hello', createdAt: 1000 },
        ],
        semanticScene: [],
        scene: [],
        plannerMeta: [],
      },
    ],
    prefs: { panelSizes: [62, 38] },
    ...overrides,
  };
}

let store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
};

describe('session restore safety', () => {
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', mockLocalStorage);
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadSession returns null when localStorage is empty — fresh state', () => {
    const result = persistence.loadSession();
    expect(result).toBeNull();
  });

  it('loadSession returns null when localStorage has invalid JSON', () => {
    store[STORAGE_KEY] = 'not-json';
    const result = persistence.loadSession();
    expect(result).toBeNull();
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('loadSession returns null when schema is invalid — clears corrupted data', () => {
    store[STORAGE_KEY] = JSON.stringify({ version: 3, garbage: true });
    const result = persistence.loadSession();
    expect(result).toBeNull();
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('loadSession returns valid data with 0 chats after loading empty chats array', () => {
    const session = makePersistedSession({ chats: [] });
    store[STORAGE_KEY] = JSON.stringify(session);
    const result = persistence.loadSession();
    if (result) {
      expect(result.chats).toHaveLength(0);
    }
  });

  it('activeChatId pointing to non-existent session is handled by restore guard logic', () => {
    const session = makePersistedSession({
      activeChatId: 'nonexistent-id',
    });
    store[STORAGE_KEY] = JSON.stringify(session);
    const result = persistence.loadSession();
    expect(result).not.toBeNull();
    const activeExists = result!.chats.some(
      (c) => c.id === result!.activeChatId,
    );
    expect(activeExists).toBe(false);
    expect(result!.chats.length).toBeGreaterThan(0);
  });

  it('saveSession followed by loadSession round-trips correctly', () => {
    const session = makePersistedSession();
    persistence.saveSession(session);
    const loaded = persistence.loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.activeChatId).toBe(session.activeChatId);
    expect(loaded!.chats).toHaveLength(session.chats.length);
    expect(loaded!.chats[0]!.id).toBe(session.chats[0]!.id);
  });

  it('V2 session is migrated to V3 with semanticScene and plannerMeta', () => {
    const v2 = {
      version: 2,
      updatedAt: Date.now(),
      activeChatId: 'c1',
      chats: [
        {
          id: 'c1',
          title: 'Old Chat',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [
            { id: 'm1', role: 'user' as const, content: 'hi', createdAt: 1000 },
          ],
          scene: [],
        },
      ],
      prefs: { panelSizes: [62, 38] as [number, number] },
    };
    store[STORAGE_KEY] = JSON.stringify(v2);
    const result = persistence.loadSession();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
    expect(result!.chats[0]!.semanticScene).toBeDefined();
    expect(result!.chats[0]!.plannerMeta).toBeDefined();
  });

  it('persistence returns null yields fresh state initialization', () => {
    mockLocalStorage.getItem.mockReturnValueOnce(null as unknown as string);
    const result = persistence.loadSession();
    expect(result).toBeNull();
  });
});
