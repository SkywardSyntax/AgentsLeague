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

// --- Typed element schemas (runtime Zod equivalents of TS types) ---

const PointSchema = z.object({ x: z.number(), y: z.number() });

const BaseDrawElementSchema = z.object({
  id: z.string(),
  color: z.string().optional(),
  stroke_width: z.number().optional(),
});

const RectSchema = BaseDrawElementSchema.extend({
  type: z.literal('rect'),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
}).passthrough();

const EllipseSchema = BaseDrawElementSchema.extend({
  type: z.literal('ellipse'),
  cx: z.number(), cy: z.number(), rx: z.number(), ry: z.number(),
}).passthrough();

const LineSchema = BaseDrawElementSchema.extend({
  type: z.literal('line'),
  from: PointSchema, to: PointSchema,
}).passthrough();

const ArrowSchema = BaseDrawElementSchema.extend({
  type: z.literal('arrow'),
  from: PointSchema, to: PointSchema,
}).passthrough();

const TextSchema = BaseDrawElementSchema.extend({
  type: z.literal('text'),
  x: z.number(), y: z.number(), text: z.string(),
  size: z.number().optional(),
}).passthrough();

const LatexSchema = BaseDrawElementSchema.extend({
  type: z.literal('latex'),
  x: z.number(), y: z.number(), tex: z.string(),
  displayMode: z.boolean().optional(),
  fontSize: z.number().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
}).passthrough();

const ClearSchema = BaseDrawElementSchema.extend({
  type: z.literal('clear'),
}).passthrough();

const DrawElementSchema = z.discriminatedUnion('type', [
  RectSchema, EllipseSchema, LineSchema, ArrowSchema,
  TextSchema, LatexSchema, ClearSchema,
]);

const SemanticBatchSchema = z.object({
  batch_id: z.string(),
  template: z.string(),
  blocks: z.array(z.object({ id: z.string(), kind: z.string() }).passthrough()),
  intent: z.string().optional(),
}).passthrough();

const PlannerMetaSchema = z.object({
  batchId: z.string(),
  violationsFixed: z.array(z.string()),
  templateUsed: z.string(),
  fallbackUsed: z.boolean(),
}).passthrough();

/** Filter array to only elements passing schema; tolerant for legacy data. */
function filterValidElements<T>(arr: unknown[], schema: z.ZodType<T>): T[] {
  const result: T[] = [];
  for (const item of arr) {
    const parsed = schema.safeParse(item);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

/** Tolerant array schema: accepts any array, filters to valid typed elements. */
function tolerantArray<T>(schema: z.ZodType<T>) {
  return z.preprocess(
    (val) => Array.isArray(val) ? filterValidElements(val, schema) : [],
    z.array(z.any()),
  ) as unknown as z.ZodType<T[]>;
}

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
      semanticScene: tolerantArray(SemanticBatchSchema),
      scene: tolerantArray(DrawElementSchema),
      plannerMeta: tolerantArray(PlannerMetaSchema),
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
      scene: tolerantArray(DrawElementSchema),
    }),
  ),
  prefs: z.object({ panelSizes: z.tuple([z.number(), z.number()]) }),
});

const LegacyPersistedSessionV1Schema = z.object({
  version: z.literal(1),
  updatedAt: z.number(),
  messages: z.array(MessageSchema),
  scene: tolerantArray(DrawElementSchema),
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
      scene: chat.scene,
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
        scene: legacy.scene,
      },
    ],
    prefs: legacy.prefs,
  };
}

export function loadSession(): PersistedSessionV3 | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    const v3 = PersistedSessionV3Schema.safeParse(parsed);
    if (v3.success) {
      return v3.data as unknown as PersistedSessionV3;
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

export function saveSession(session: PersistedSessionV3): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}
