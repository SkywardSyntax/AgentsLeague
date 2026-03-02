import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as persistence from '@/lib/client/persistence';
import type { SemanticCaptionBlock } from '@/types/agent';

const STORAGE_KEY = 'agentsleague:session:v1';

let store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
};

describe('persistence migration — createLocalId and importedLegacySemanticBatch via public API', () => {
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
    expect(batch.blocks[0]!.region_hint).toBe('bottom');
  });
});
