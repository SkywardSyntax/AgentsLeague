import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { loadSession, saveSession, type PersistedSessionV3 } from '@/lib/client/persistence';

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
};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal('localStorage', localStorageMock);
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function validChat(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chat-1',
    title: 'Test Chat',
    createdAt: 1000,
    updatedAt: 2000,
    messages: [],
    semanticScene: [{ batch_id: 'b1', template: 'freeform_semantic', blocks: [] }],
    scene: [{ id: 'el-1', type: 'rect', x: 0, y: 0, w: 100, h: 50 }],
    plannerMeta: [{ batchId: 'b1', templateUsed: 'freeform_semantic', fallbackUsed: false, violationsFixed: [] }],
    ...overrides,
  };
}

function validV3(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 3,
    updatedAt: Date.now(),
    activeChatId: 'chat-1',
    chats: [validChat()],
    prefs: { panelSizes: [62, 38] },
    ...overrides,
  };
}

describe('persistence schema validation', () => {
  describe('valid data passes', () => {
    it('accepts valid V3 session data', () => {
      store['agentsleague:session:v1'] = JSON.stringify(validV3());
      const result = loadSession();
      expect(result).not.toBeNull();
      expect(result!.version).toBe(3);
      expect(result!.chats).toHaveLength(1);
    });

    it('accepts items with extra fields via passthrough', () => {
      const chat = validChat({
        semanticScene: [{ batch_id: 'b1', template: 'freeform_semantic', blocks: [], extraField: 'ok' }],
        scene: [{ id: 'el-1', type: 'rect', x: 0, y: 0, w: 100, h: 50, customProp: true }],
        plannerMeta: [{ batchId: 'b1', additionalInfo: 42 }],
      });
      store['agentsleague:session:v1'] = JSON.stringify(validV3({ chats: [chat] }));
      const result = loadSession();
      expect(result).not.toBeNull();
      expect(result!.chats[0]!.semanticScene[0]).toHaveProperty('extraField', 'ok');
    });
  });

  describe('semanticScene validation', () => {
    it('rejects items missing batch_id', () => {
      const chat = validChat({
        semanticScene: [{ template: 'freeform_semantic', blocks: [] }],
      });
      store['agentsleague:session:v1'] = JSON.stringify(validV3({ chats: [chat] }));
      const result = loadSession();
      expect(result).toBeNull();
    });

    it('rejects non-object items in semanticScene', () => {
      const chat = validChat({ semanticScene: ['not-an-object'] });
      store['agentsleague:session:v1'] = JSON.stringify(validV3({ chats: [chat] }));
      const result = loadSession();
      expect(result).toBeNull();
    });

    it('rejects numeric batch_id', () => {
      const chat = validChat({
        semanticScene: [{ batch_id: 123 }],
      });
      store['agentsleague:session:v1'] = JSON.stringify(validV3({ chats: [chat] }));
      const result = loadSession();
      expect(result).toBeNull();
    });
  });

  describe('scene validation', () => {
    it('rejects items missing id', () => {
      const chat = validChat({
        scene: [{ type: 'rect', x: 0, y: 0 }],
      });
      store['agentsleague:session:v1'] = JSON.stringify(validV3({ chats: [chat] }));
      const result = loadSession();
      expect(result).toBeNull();
    });

    it('rejects items missing type', () => {
      const chat = validChat({
        scene: [{ id: 'el-1', x: 0, y: 0 }],
      });
      store['agentsleague:session:v1'] = JSON.stringify(validV3({ chats: [chat] }));
      const result = loadSession();
      expect(result).toBeNull();
    });

    it('rejects numbers instead of objects in scene', () => {
      const chat = validChat({ scene: [42] });
      store['agentsleague:session:v1'] = JSON.stringify(validV3({ chats: [chat] }));
      const result = loadSession();
      expect(result).toBeNull();
    });
  });

  describe('plannerMeta validation', () => {
    it('rejects items missing batchId', () => {
      const chat = validChat({
        plannerMeta: [{ templateUsed: 'freeform_semantic', fallbackUsed: false }],
      });
      store['agentsleague:session:v1'] = JSON.stringify(validV3({ chats: [chat] }));
      const result = loadSession();
      expect(result).toBeNull();
    });

    it('rejects string instead of objects in plannerMeta', () => {
      const chat = validChat({ plannerMeta: ['bad'] });
      store['agentsleague:session:v1'] = JSON.stringify(validV3({ chats: [chat] }));
      const result = loadSession();
      expect(result).toBeNull();
    });
  });

  describe('V2 schema migration with scene validation', () => {
    it('accepts valid V2 data with scene objects having id and type', () => {
      const v2Data = {
        version: 2,
        updatedAt: Date.now(),
        activeChatId: 'chat-1',
        chats: [
          {
            id: 'chat-1',
            title: 'V2 Chat',
            createdAt: 1000,
            updatedAt: 2000,
            messages: [],
            scene: [{ id: 'el-1', type: 'rect', x: 0, y: 0 }],
          },
        ],
        prefs: { panelSizes: [62, 38] },
      };
      store['agentsleague:session:v1'] = JSON.stringify(v2Data);
      const result = loadSession();
      expect(result).not.toBeNull();
      expect(result!.version).toBe(3);
    });

    it('rejects V2 data with invalid scene elements', () => {
      const v2Data = {
        version: 2,
        updatedAt: Date.now(),
        activeChatId: 'chat-1',
        chats: [
          {
            id: 'chat-1',
            title: 'V2 Chat',
            createdAt: 1000,
            updatedAt: 2000,
            messages: [],
            scene: [{ noId: true }],
          },
        ],
        prefs: { panelSizes: [62, 38] },
      };
      store['agentsleague:session:v1'] = JSON.stringify(v2Data);
      const result = loadSession();
      expect(result).toBeNull();
    });
  });

  describe('V1 schema migration with scene validation', () => {
    it('accepts valid V1 data', () => {
      const v1Data = {
        version: 1,
        updatedAt: Date.now(),
        messages: [],
        scene: [{ id: 'el-1', type: 'text', text: 'hello' }],
        prefs: { panelSizes: [62, 38] },
      };
      store['agentsleague:session:v1'] = JSON.stringify(v1Data);
      const result = loadSession();
      expect(result).not.toBeNull();
      expect(result!.version).toBe(3);
    });

    it('rejects V1 data with invalid scene elements', () => {
      const v1Data = {
        version: 1,
        updatedAt: Date.now(),
        messages: [],
        scene: [999],
        prefs: { panelSizes: [62, 38] },
      };
      store['agentsleague:session:v1'] = JSON.stringify(v1Data);
      const result = loadSession();
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null for completely invalid JSON', () => {
      store['agentsleague:session:v1'] = 'not json at all';
      const result = loadSession();
      expect(result).toBeNull();
    });

    it('returns null when no data in storage', () => {
      const result = loadSession();
      expect(result).toBeNull();
    });

    it('accepts empty arrays for semanticScene, scene, and plannerMeta', () => {
      const chat = validChat({
        semanticScene: [],
        scene: [],
        plannerMeta: [],
      });
      store['agentsleague:session:v1'] = JSON.stringify(validV3({ chats: [chat] }));
      const result = loadSession();
      expect(result).not.toBeNull();
    });
  });
});
