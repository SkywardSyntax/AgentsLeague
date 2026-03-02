import { z } from 'zod';
import type {
  ChatMessage,
  DrawElement,
  SemanticBatch,
  WhiteboardLayoutDiagnostics,
} from '@/types/agent';

export interface PersistedChatV3 {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  semanticScene: SemanticBatch[];
  scene: DrawElement[];
  plannerMeta: WhiteboardLayoutDiagnostics[];
}

export interface PersistedSessionV3 {
  version: 3;
  updatedAt: number;
  activeChatId: string;
  chats: PersistedChatV3[];
  prefs: {
    panelSizes: [number, number];
  };
}

const STORAGE_KEY = 'agentsleague:session:v1';

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  createdAt: z.number(),
});

const PersistedSessionV3Schema = z.object({
  version: z.literal(3),
  updatedAt: z.number(),
  activeChatId: z.string(),
  chats: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      createdAt: z.number(),
      updatedAt: z.number(),
      messages: z.array(MessageSchema),
      semanticScene: z.array(z.any()),
      scene: z.array(z.any()),
      plannerMeta: z.array(z.any()),
    }),
  ),
  prefs: z.object({ panelSizes: z.tuple([z.number(), z.number()]) }),
});

const PersistedSessionV2Schema = z.object({
  version: z.literal(2),
  updatedAt: z.number(),
  activeChatId: z.string(),
  chats: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      createdAt: z.number(),
      updatedAt: z.number(),
      messages: z.array(MessageSchema),
      scene: z.array(z.any()),
    }),
  ),
  prefs: z.object({ panelSizes: z.tuple([z.number(), z.number()]) }),
});

const LegacyPersistedSessionV1Schema = z.object({
  version: z.literal(1),
  updatedAt: z.number(),
  messages: z.array(MessageSchema),
  scene: z.array(z.any()),
  prefs: z.object({ panelSizes: z.tuple([z.number(), z.number()]) }),
});

function createLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function importedLegacySemanticBatch(id: string, sceneSize: number): SemanticBatch {
  return {
    batch_id: `imported-${id}`,
    template: 'freeform_semantic',
    intent: 'summarize',
    blocks: [
      {
        id: `imported-${id}-caption`,
        kind: 'caption',
        text: `Imported legacy scene (${sceneSize} elements)`,
        region_hint: 'bottom',
      },
    ],
  };
}

function migrateV2toV3(v2: z.infer<typeof PersistedSessionV2Schema>): PersistedSessionV3 {
  return {
    version: 3,
    updatedAt: v2.updatedAt,
    activeChatId: v2.activeChatId,
    chats: v2.chats.map((chat) => ({
      ...chat,
      semanticScene: [importedLegacySemanticBatch(chat.id, chat.scene.length)],
      plannerMeta: [],
      scene: chat.scene as DrawElement[],
    })),
    prefs: v2.prefs,
  };
}

function migrateV1toV3(legacy: z.infer<typeof LegacyPersistedSessionV1Schema>): PersistedSessionV3 {
  const chatId = createLocalId();
  return {
    version: 3,
    updatedAt: legacy.updatedAt,
    activeChatId: chatId,
    chats: [
      {
        id: chatId,
        title: 'Chat 1',
        createdAt: legacy.updatedAt,
        updatedAt: legacy.updatedAt,
        messages: legacy.messages,
        semanticScene: [importedLegacySemanticBatch(chatId, legacy.scene.length)],
        plannerMeta: [],
        scene: legacy.scene as DrawElement[],
      },
    ],
    prefs: legacy.prefs,
  };
}

/**
 * Loads the persisted session from localStorage, migrating from V1/V2 if needed.
 * Returns null and clears storage if the data is corrupt or unparseable.
 */
export function loadSession(): PersistedSessionV3 | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    const v3 = PersistedSessionV3Schema.safeParse(parsed);
    if (v3.success) {
      return v3.data as PersistedSessionV3;
    }

    const v2 = PersistedSessionV2Schema.safeParse(parsed);
    if (v2.success) {
      return migrateV2toV3(v2.data);
    }

    const v1 = LegacyPersistedSessionV1Schema.safeParse(parsed);
    if (v1.success) {
      return migrateV1toV3(v1.data);
    }

    throw new Error('Invalid persisted session schema');
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/** Persists the current session state to localStorage as a V3 payload. */
export function saveSession(session: PersistedSessionV3): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}
