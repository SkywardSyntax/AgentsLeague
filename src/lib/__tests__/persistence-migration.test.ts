import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadSession, saveSession, type PersistedSessionV3 } from '@/lib/client/persistence';
import * as persistence from '@/lib/client/persistence';
import type { SemanticCaptionBlock } from '@/types/agent';

const STORAGE_KEY = 'agentsleague:session:v1';

let store: Record<string, string> = {};
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
    store = {};
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
          scene: [{ type: 'rect', id: 'r1', x: 0, y: 0, w: 10, h: 10 }, { type: 'ellipse', id: 'e1', cx: 0, cy: 0, rx: 5, ry: 5 }],
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

describe('loadSession — typed schema validation', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
  });

  it('rejects session when scene contains elements missing the type field', () => {
    const session = makeV3Session();
    session.chats[0].scene = [
      { type: 'rect', id: 'r1', x: 0, y: 0, w: 50, h: 50 } as any,
      { id: 'bad', x: 0, y: 0 } as any,
    ];
    saveSession(session);
    const loaded = loadSession();
    expect(loaded).toBeNull();
  });

  it('loads valid session with properly typed scene elements', () => {
    const session = makeV3Session();
    session.chats[0].scene = [
      { type: 'text', id: 't1', x: 10, y: 20, text: 'hello' },
      { type: 'clear', id: 'c1' },
    ];
    saveSession(session);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.chats[0].scene).toHaveLength(2);
  });

  it('rejects session when semanticScene contains invalid elements', () => {
    const session = makeV3Session();
    session.chats[0].semanticScene = [
      {
        batch_id: 'b1', template: 'freeform_semantic',
        blocks: [{ id: 'bl1', kind: 'caption', text: 'ok', region_hint: 'bottom' }],
      },
      { missing: 'fields' } as any,
    ];
    saveSession(session);
    const loaded = loadSession();
    expect(loaded).toBeNull();
  });

  it('rejects V2 data when scene contains invalid elements', () => {
    const v2Data = {
      version: 2,
      updatedAt: 1000,
      activeChatId: 'c1',
      chats: [{
        id: 'c1', title: 'Legacy', createdAt: 500, updatedAt: 1000,
        messages: [],
        scene: [
          { type: 'rect', id: 'r1', x: 0, y: 0, w: 10, h: 10 },
          { broken: true },
        ],
      }],
      prefs: { panelSizes: [40, 60] },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2Data));
    const loaded = loadSession();
    expect(loaded).toBeNull();
  });
});

describe('persistence migration — createLocalId and importedLegacySemanticBatch via public API', () => {
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', localStorageMock);
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('V1→V3 migration generates a UUID-format activeChatId (createLocalId with crypto.randomUUID)', () => {
    const v1 = {
      version: 1,
      updatedAt: 1000,
      messages: [{ id: 'm1', role: 'user' as const, content: 'hi', createdAt: 1000 }],
      scene: [],
      prefs: { panelSizes: [62, 38] as [number, number] },
    };
    store[STORAGE_KEY] = JSON.stringify(v1);
    const result = persistence.loadSession();
    expect(result).not.toBeNull();
    expect(result!.activeChatId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result!.chats[0]!.id).toBe(result!.activeChatId);
  });

  it('V1→V3 migration creates exactly one chat preserving messages and scene', () => {
    const v1 = {
      version: 1,
      updatedAt: 2000,
      messages: [
        { id: 'm1', role: 'user' as const, content: 'hello', createdAt: 1000 },
        { id: 'm2', role: 'assistant' as const, content: 'hi', createdAt: 1500 },
      ],
      scene: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
      prefs: { panelSizes: [62, 38] as [number, number] },
    };
    store[STORAGE_KEY] = JSON.stringify(v1);
    const result = persistence.loadSession();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
    expect(result!.chats).toHaveLength(1);
    expect(result!.chats[0]!.messages).toHaveLength(2);
    expect(result!.chats[0]!.scene).toHaveLength(1);
    expect(result!.chats[0]!.semanticScene).toHaveLength(1);
  });

  it('V2→V3 migration produces importedLegacySemanticBatch with 0 elements', () => {
    const v2 = {
      version: 2,
      updatedAt: 3000,
      activeChatId: 'c1',
      chats: [{
        id: 'c1',
        title: 'Chat',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [{ id: 'm1', role: 'user' as const, content: 'hi', createdAt: 1000 }],
        scene: [],
      }],
      prefs: { panelSizes: [62, 38] as [number, number] },
    };
    store[STORAGE_KEY] = JSON.stringify(v2);
    const result = persistence.loadSession();
    expect(result).not.toBeNull();
    const batch = result!.chats[0]!.semanticScene[0]!;
    expect(batch.batch_id).toMatch(/^imported-/);
    expect(batch.template).toBe('freeform_semantic');
    expect(batch.blocks).toHaveLength(1);
    expect((batch.blocks[0] as SemanticCaptionBlock).text).toContain('0 elements');
  });

  it('V2→V3 migration produces importedLegacySemanticBatch reflecting scene size', () => {
    const scene = Array.from({ length: 5 }, (_, i) => ({
      id: `el-${i}`,
      type: 'rect',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    }));
    const v2 = {
      version: 2,
      updatedAt: 4000,
      activeChatId: 'c2',
      chats: [{
        id: 'c2',
        title: 'Chat 2',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [{ id: 'm1', role: 'user' as const, content: 'hi', createdAt: 1000 }],
        scene,
      }],
      prefs: { panelSizes: [62, 38] as [number, number] },
    };
    store[STORAGE_KEY] = JSON.stringify(v2);
    const result = persistence.loadSession();
    expect(result).not.toBeNull();
    const batch = result!.chats[0]!.semanticScene[0]!;
    expect(batch.batch_id).toBe('imported-c2');
    expect((batch.blocks[0] as SemanticCaptionBlock).text).toContain('5 elements');
    expect(batch.blocks[0]!.kind).toBe('caption');
  });

  it('V2→V3 migration batch has correct structure (intent, region_hint)', () => {
    const v2 = {
      version: 2,
      updatedAt: 5000,
      activeChatId: 'c3',
      chats: [{
        id: 'c3',
        title: 'Chat 3',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [{ id: 'm1', role: 'user' as const, content: 'hi', createdAt: 1000 }],
        scene: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
      }],
      prefs: { panelSizes: [62, 38] as [number, number] },
    };
    store[STORAGE_KEY] = JSON.stringify(v2);
    const result = persistence.loadSession();
    expect(result).not.toBeNull();
    const batch = result!.chats[0]!.semanticScene[0]!;
    expect(batch.intent).toBe('summarize');
    expect((batch.blocks[0]! as any).region_hint).toBe('bottom');
  });
});
