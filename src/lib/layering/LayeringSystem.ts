/**
 * Fractional indexing for insertion-free z-ordering.
 * Uses string-based keys so new layers can be inserted between any two
 * existing layers without renumbering.
 */

// ── Fractional index utilities ────────────────────────────

const MIDPOINT_CHARS = 'abcdefghijklmnopqrstuvwxyz';
const MID = Math.floor(MIDPOINT_CHARS.length / 2);

/** Generate a fractional key between two string keys. */
export function midpoint(a: string | null, b: string | null): string {
  if (a === null && b === null) return MIDPOINT_CHARS[MID]!;
  if (a === null) return midpointBefore(b!);
  if (b === null) return midpointAfter(a);

  if (a >= b) throw new Error(`Invalid order: "${a}" must be less than "${b}"`);

  // Find first differing position
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 96; // before 'a'
    const cb = i < b.length ? b.charCodeAt(i) : 123; // after 'z'
    if (cb - ca > 1) {
      return a.slice(0, i) + String.fromCharCode(Math.floor((ca + cb) / 2));
    }
    if (ca === cb) continue;
    // Adjacent chars at this position: extend with midpoint char
    return a.slice(0, i + 1) + MIDPOINT_CHARS[MID]!;
  }
  return a + MIDPOINT_CHARS[MID]!;
}

function midpointBefore(b: string): string {
  const code = b.charCodeAt(0);
  if (code > 97) return String.fromCharCode(Math.floor((96 + code) / 2));
  return 'a' + MIDPOINT_CHARS[MID]!;
}

function midpointAfter(a: string): string {
  const code = a.charCodeAt(a.length - 1);
  if (code < 122) return a.slice(0, -1) + String.fromCharCode(code + 1);
  return a + MIDPOINT_CHARS[MID]!;
}

// ── Layer types ───────────────────────────────────────────

export interface Layer {
  id: string;
  name: string;
  /** Fractional index for z-ordering. */
  zIndex: string;
  visible: boolean;
  locked: boolean;
  /** Element IDs belonging to this layer. */
  elementIds: Set<string>;
  /** Parent group id, or null for root layers. */
  parentId: string | null;
}

export interface LayerGroup {
  id: string;
  name: string;
  zIndex: string;
  visible: boolean;
  locked: boolean;
  collapsed: boolean;
}

export class LayeringSystem {
  private layers = new Map<string, Layer>();
  private groups = new Map<string, LayerGroup>();
  private sortedCache: Layer[] | null = null;

  /** Create a new layer with automatic z-index placement. */
  createLayer(id: string, name: string, parentId: string | null = null): Layer {
    const sorted = this.getSortedLayers();
    const lastKey = sorted.length > 0 ? sorted[sorted.length - 1]!.zIndex : null;
    const zIndex = midpoint(lastKey, null);

    const layer: Layer = {
      id,
      name,
      zIndex,
      visible: true,
      locked: false,
      elementIds: new Set(),
      parentId,
    };
    this.layers.set(id, layer);
    this.sortedCache = null;
    return layer;
  }

  /** Create a layer group. */
  createGroup(id: string, name: string): LayerGroup {
    const sorted = this.getSortedLayers();
    const lastKey = sorted.length > 0 ? sorted[sorted.length - 1]!.zIndex : null;

    const group: LayerGroup = {
      id,
      name,
      zIndex: midpoint(lastKey, null),
      visible: true,
      locked: false,
      collapsed: false,
    };
    this.groups.set(id, group);
    return group;
  }

  /** Get layers sorted by z-index (cached). */
  getSortedLayers(): Layer[] {
    this.sortedCache ??= Array.from(this.layers.values()).sort((a, b) =>
      a.zIndex < b.zIndex ? -1 : a.zIndex > b.zIndex ? 1 : 0,
    );
    return this.sortedCache;
  }

  /** Move a layer to the front (highest z-index). */
  moveToFront(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    const sorted = this.getSortedLayers();
    const last = sorted[sorted.length - 1];
    if (last && last.id !== layerId) {
      layer.zIndex = midpoint(last.zIndex, null);
      this.sortedCache = null;
    }
  }

  /** Move a layer to the back (lowest z-index). */
  moveToBack(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    const sorted = this.getSortedLayers();
    const first = sorted[0];
    if (first && first.id !== layerId) {
      layer.zIndex = midpoint(null, first.zIndex);
      this.sortedCache = null;
    }
  }

  /** Move a layer to be directly before another layer. */
  moveBefore(layerId: string, beforeLayerId: string): void {
    const layer = this.layers.get(layerId);
    const target = this.layers.get(beforeLayerId);
    if (!layer || !target) return;

    const sorted = this.getSortedLayers().filter((l) => l.id !== layerId);
    const idx = sorted.findIndex((l) => l.id === beforeLayerId);
    const prevKey = idx > 0 ? sorted[idx - 1]!.zIndex : null;
    layer.zIndex = midpoint(prevKey, target.zIndex);
    this.sortedCache = null;
  }

  /** Set layer visibility. */
  setVisibility(layerId: string, visible: boolean): void {
    const layer = this.layers.get(layerId);
    if (layer) layer.visible = visible;
  }

  /** Set layer lock state. */
  setLocked(layerId: string, locked: boolean): void {
    const layer = this.layers.get(layerId);
    if (layer) layer.locked = locked;
  }

  /** Toggle group visibility (cascades to child layers). */
  setGroupVisibility(groupId: string, visible: boolean): void {
    const group = this.groups.get(groupId);
    if (group) group.visible = visible;
    for (const layer of this.layers.values()) {
      if (layer.parentId === groupId) layer.visible = visible;
    }
  }

  /** Add an element to a layer. */
  addElement(layerId: string, elementId: string): void {
    const layer = this.layers.get(layerId);
    if (layer) layer.elementIds.add(elementId);
  }

  /** Remove an element from a layer. */
  removeElement(layerId: string, elementId: string): void {
    const layer = this.layers.get(layerId);
    if (layer) layer.elementIds.delete(elementId);
  }

  /** Get the layer for a specific element. */
  getLayerForElement(elementId: string): Layer | undefined {
    for (const layer of this.layers.values()) {
      if (layer.elementIds.has(elementId)) return layer;
    }
    return undefined;
  }

  getLayer(id: string): Layer | undefined {
    return this.layers.get(id);
  }

  getGroup(id: string): LayerGroup | undefined {
    return this.groups.get(id);
  }

  removeLayer(id: string): void {
    this.layers.delete(id);
    this.sortedCache = null;
  }

  clear(): void {
    this.layers.clear();
    this.groups.clear();
    this.sortedCache = null;
  }
}
