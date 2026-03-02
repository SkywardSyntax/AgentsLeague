import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PersistedSessionV3 } from '../persistence';

// Stub localStorage before importing the module
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

function makeMsg(id: string, role: 'user' | 'assistant' | 'system' = 'user', content = 'hello') {
  return { id, role, content, createdAt: Date.now() };
}

function makeV3Session(overrides: Partial<PersistedSessionV3> = {}): PersistedSessionV3 {
  return {
    version: 3,
    updatedAt: Date.now(),
    activeChatId: 'c1',
    chats: [
      {
        id: 'c1',
        title: 'Test Chat',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [makeMsg('m1')],
        semanticScene: [],
        scene: [],
        plannerMeta: [],
      },
    ],
    prefs: { panelSizes: [50, 50] },
    ...overrides,
  };
}

function makeV2Data() {
  return {
    version: 2 as const,
    updatedAt: Date.now(),
    activeChatId: 'c1',
    chats: [
      {
        id: 'c1',
        title: 'V2 Chat',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [makeMsg('m1')],
        scene: [{ id: 'el1', type: 'rect', x: 0, y: 0, width: 100, height: 50, text: 'hi' }],
      },
    ],
    prefs: { panelSizes: [60, 40] as [number, number] },
  };
}

function makeV1Data() {
  return {
    version: 1 as const,
    updatedAt: Date.now(),
    messages: [makeMsg('m1'), makeMsg('m2', 'assistant', 'reply')],
    scene: [{ id: 'el1', type: 'line', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }],
    prefs: { panelSizes: [50, 50] as [number, number] },
  };
}

describe('loadSession', () => {
  let loadSession: typeof import('../persistence').loadSession;

  beforeEach(async () => {
    storage.clear();
    vi.clearAllMocks();
    // Fresh import each time to avoid stale module state
    const mod = await import('../persistence');
    loadSession = mod.loadSession;
  });

  it('returns null when no stored data', () => {
    expect(loadSession()).toBeNull();
  });

  it('parses valid V3 session unchanged', () => {
    const v3 = makeV3Session();
    storage.set(STORAGE_KEY, JSON.stringify(v3));
    const result = loadSession();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
    expect(result!.chats[0].title).toBe('Test Chat');
    expect(result!.chats[0].semanticScene).toEqual([]);
  });

  it('auto-migrates V2 to V3', () => {
    const v2 = makeV2Data();
    storage.set(STORAGE_KEY, JSON.stringify(v2));
    const result = loadSession();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
    expect(result!.chats[0].title).toBe('V2 Chat');
    // semanticScene should be created with imported batch
    expect(result!.chats[0].semanticScene).toHaveLength(1);
    expect(result!.chats[0].semanticScene[0].batch_id).toContain('imported-');
    // plannerMeta should be empty array
    expect(result!.chats[0].plannerMeta).toEqual([]);
    // messages preserved verbatim
    expect(result!.chats[0].messages[0].content).toBe('hello');
    // prefs preserved
    expect(result!.prefs.panelSizes).toEqual([60, 40]);
  });

  it('auto-migrates V1 to V3', () => {
    const v1 = makeV1Data();
    storage.set(STORAGE_KEY, JSON.stringify(v1));
    const result = loadSession();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
    // V1 creates exactly one chat with title "Chat 1"
    expect(result!.chats).toHaveLength(1);
    expect(result!.chats[0].title).toBe('Chat 1');
    // activeChatId should match the chat id
    expect(result!.activeChatId).toBe(result!.chats[0].id);
    // messages preserved
    expect(result!.chats[0].messages).toHaveLength(2);
    expect(result!.chats[0].messages[1].content).toBe('reply');
    // semanticScene created
    expect(result!.chats[0].semanticScene).toHaveLength(1);
    expect(result!.chats[0].semanticScene[0].batch_id).toContain('imported-');
    // plannerMeta empty
    expect(result!.chats[0].plannerMeta).toEqual([]);
  });

  it('returns null and removes key for corrupted JSON', () => {
    storage.set(STORAGE_KEY, '{{not valid json');
    const result = loadSession();
    expect(result).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('returns null and removes key for invalid schema', () => {
    storage.set(STORAGE_KEY, JSON.stringify({ version: 99, foo: 'bar' }));
    const result = loadSession();
    expect(result).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('V2 with empty scene migrates without crash', () => {
    const v2 = makeV2Data();
    v2.chats[0].scene = [];
    storage.set(STORAGE_KEY, JSON.stringify(v2));
    const result = loadSession();
    expect(result).not.toBeNull();
    expect(result!.chats[0].semanticScene).toHaveLength(1);
    expect(result!.chats[0].scene).toEqual([]);
  });

  it('V2 preserves all messages verbatim', () => {
    const v2 = makeV2Data();
    v2.chats[0].messages = [
      makeMsg('m1', 'user', 'question with $$LaTeX$$'),
      makeMsg('m2', 'assistant', 'answer with `code`'),
    ];
    storage.set(STORAGE_KEY, JSON.stringify(v2));
    const result = loadSession();
    expect(result!.chats[0].messages[0].content).toBe('question with $$LaTeX$$');
    expect(result!.chats[0].messages[1].content).toBe('answer with `code`');
  });

  it('V1 generates a string chatId', () => {
    const v1 = makeV1Data();
    storage.set(STORAGE_KEY, JSON.stringify(v1));
    const result = loadSession();
    expect(typeof result!.chats[0].id).toBe('string');
    expect(result!.chats[0].id.length).toBeGreaterThan(0);
  });
});

describe('saveSession', () => {
  let saveSession: typeof import('../persistence').saveSession;

  beforeEach(async () => {
    storage.clear();
    vi.clearAllMocks();
    const mod = await import('../persistence');
    saveSession = mod.saveSession;
  });

  it('persists session to localStorage', () => {
    const session = makeV3Session();
    saveSession(session);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(session));
  });
});
