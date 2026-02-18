import type { Camera, DrawElement, ToolType } from '@/types';

// ── Types ───────────────────────────────────────────────────────────

export interface WhiteboardState {
  elements: Map<string, DrawElement>;
  selectedIds: Set<string>;
  camera: Camera;
  activeTool: ToolType;
}

/** Serialisable representation stored in localStorage. */
interface StorageEnvelope {
  version: number;
  timestamp: number;
  state: SerializedWhiteboardState;
}

interface SerializedWhiteboardState {
  elements: [string, DrawElement][];
  selectedIds: string[];
  camera: Camera;
  activeTool: ToolType;
}

// ── Constants ───────────────────────────────────────────────────────

const STORAGE_KEY = 'whiteboard-canvas-state';
const CURRENT_VERSION = 1;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Serialization helpers ───────────────────────────────────────────

function serialize(state: WhiteboardState): SerializedWhiteboardState {
  return {
    elements: Array.from(state.elements.entries()),
    selectedIds: Array.from(state.selectedIds),
    camera: state.camera,
    activeTool: state.activeTool,
  };
}

function deserialize(data: SerializedWhiteboardState): WhiteboardState {
  return {
    elements: new Map(data.elements),
    selectedIds: new Set(data.selectedIds),
    camera: data.camera,
    activeTool: data.activeTool,
  };
}

// ── Validation ──────────────────────────────────────────────────────

function isValidEnvelope(value: unknown): value is StorageEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    typeof obj.timestamp === 'number' &&
    typeof obj.state === 'object' &&
    obj.state !== null
  );
}

function isValidSerializedState(
  value: unknown,
): value is SerializedWhiteboardState {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.elements) &&
    Array.isArray(obj.selectedIds) &&
    typeof obj.camera === 'object' &&
    obj.camera !== null &&
    typeof obj.activeTool === 'string'
  );
}

// ── Schema migration ────────────────────────────────────────────────

type Migrator = (envelope: StorageEnvelope) => StorageEnvelope;

/** Add entries here when bumping CURRENT_VERSION. Key = version to migrate FROM. */
const migrations: Record<number, Migrator> = {
  // Example for future use:
  // 1: (env) => ({ ...env, version: 2, state: { ...env.state, newField: defaultValue } }),
};

function migrate(envelope: StorageEnvelope): StorageEnvelope | null {
  let current = envelope;
  while (current.version < CURRENT_VERSION) {
    const migrator = migrations[current.version];
    if (!migrator) return null; // unsupported version gap
    current = migrator(current);
  }
  return current;
}

// ── Public API ──────────────────────────────────────────────────────

export function saveCanvasState(state: WhiteboardState): void {
  try {
    const envelope: StorageEnvelope = {
      version: CURRENT_VERSION,
      timestamp: Date.now(),
      state: serialize(state),
    };

    const json = JSON.stringify(envelope);

    if (json.length > MAX_SIZE_BYTES) {
      console.warn(
        `[whiteboardStorage] State size (${json.length} bytes) exceeds ${MAX_SIZE_BYTES} byte limit. Skipping save.`,
      );
      return;
    }

    localStorage.setItem(STORAGE_KEY, json);
  } catch (error: unknown) {
    // Handle QuotaExceededError and other storage failures
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    ) {
      console.warn('[whiteboardStorage] localStorage quota exceeded.');
    } else {
      console.warn('[whiteboardStorage] Failed to save state:', error);
    }
  }
}

export function loadCanvasState(): WhiteboardState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);

    if (!isValidEnvelope(parsed)) return null;

    const migrated = migrate(parsed);
    if (!migrated) return null;

    if (!isValidSerializedState(migrated.state)) return null;

    return deserialize(migrated.state);
  } catch {
    // Corrupted JSON or any other error
    return null;
  }
}

export function clearCanvasState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently ignore — storage may be unavailable
  }
}
