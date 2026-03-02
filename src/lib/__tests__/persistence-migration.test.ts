import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSession, saveSession, type PersistedSessionV3 } from '@/lib/client/persistence';

const STORAGE_KEY = 'agentsleague:session:v1';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

function makeV3Session(overrides: Partial<PersistedSessionV3> = {}): PersistedSessionV3 {
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

describe('loadSession — error recovery', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.clearAllMocks();
  });

  it('returns null when localStorage has no entry', () => {
    expect(loadSession()).toBeNull();
  });

  it('returns null and clears storage on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{broken');
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns null and clears storage on valid JSON with invalid schema', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('round-trips data via saveSession then loadSession', () => {
    const session = makeV3Session();
    saveSession(session);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.activeChatId).toBe('chat-1');
    expect(loaded!.chats).toHaveLength(1);
    expect(loaded!.version).toBe(3);
  });

  it('auto-migrates V2 data to V3 with importedLegacySemanticBatch', () => {
    const v2Data = {
      version: 2,
      updatedAt: 1000,
      activeChatId: 'c1',
      chats: [
        {
          id: 'c1',
          title: 'Legacy',
          createdAt: 500,
          updatedAt: 1000,
          messages: [],
          scene: [{ type: 'rect' }, { type: 'ellipse' }],
        },
      ],
      prefs: { panelSizes: [40, 60] },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2Data));

    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.chats[0].semanticScene).toHaveLength(1);

    const batch = loaded!.chats[0].semanticScene[0];
    expect(batch.batch_id).toMatch(/^imported-/);
    expect(batch.template).toBe('freeform_semantic');
    expect(batch.blocks).toHaveLength(1);
    const block = batch.blocks[0];
    expect(block.kind).toBe('caption');
    if (block.kind === 'caption') {
      expect(block.text).toContain('2 elements');
    }
  });
});
