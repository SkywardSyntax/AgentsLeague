import type { DrawBatch, StrokeTrajectory } from '@/types/agent';

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface Group {
  sourceId: string;
  strokes: StrokeTrajectory[];
  bounds: Bounds;
}

function computeBounds(strokes: StrokeTrajectory[]): Bounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of strokes) {
    for (const point of stroke.points) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, maxX, minY, maxY };
}

function shiftGroup(group: Group, dy: number): void {
  if (dy === 0) return;
  group.strokes.forEach((stroke) => {
    stroke.points = stroke.points.map((point) => ({ x: point.x, y: point.y + dy }));
  });
  group.bounds = {
    ...group.bounds,
    minY: group.bounds.minY + dy,
    maxY: group.bounds.maxY + dy,
  };
}

function horizontalOverlap(a: Bounds, b: Bounds): number {
  return Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
}

function resolveSourceElementId(strokeElementId: string, candidates: string[]): string | null {
  for (const id of candidates) {
    if (strokeElementId === id || strokeElementId.startsWith(`${id}-`)) return id;
  }
  return null;
}

function groupedBoundsByElementId(strokes: StrokeTrajectory[]): Bounds[] {
  const groups = new Map<string, StrokeTrajectory[]>();
  for (const stroke of strokes) {
    const key = stroke.elementId;
    const list = groups.get(key);
    if (list) list.push(stroke);
    else groups.set(key, [stroke]);
  }

  return [...groups.values()]
    .map((groupStrokes) => computeBounds(groupStrokes))
    .filter((b): b is Bounds => b !== null);
}

/**
 * Adjusts vertical positions of text/LaTeX strokes in a batch to avoid overlapping
 * existing scene strokes. Mutates {@link batchStrokes} in place.
 */
export function normalizeBatchTextSpacingAgainstScene(
  batch: DrawBatch,
  batchStrokes: StrokeTrajectory[],
  sceneStrokes: StrokeTrajectory[],
): void {
  const textLikeIds = batch.elements
    .filter((el) => el.type === 'text' || el.type === 'latex')
    .map((el) => el.id);
  if (textLikeIds.length === 0 || batchStrokes.length === 0) return;

  const candidates = [...textLikeIds].sort((a, b) => b.length - a.length);
  const grouped = new Map<string, StrokeTrajectory[]>();

  const sceneBlockers: Bounds[] = groupedBoundsByElementId(sceneStrokes);

  const inlineBlockingStrokes: StrokeTrajectory[] = [];
  for (const stroke of batchStrokes) {
    const sourceId = resolveSourceElementId(stroke.elementId, candidates);
    if (!sourceId) {
      inlineBlockingStrokes.push(stroke);
      continue;
    }

    const list = grouped.get(sourceId);
    if (list) list.push(stroke);
    else grouped.set(sourceId, [stroke]);
  }

  const groups: Group[] = [...grouped.entries()]
    .map(([sourceId, strokes]) => {
      const bounds = computeBounds(strokes);
      if (!bounds) return null;
      return { sourceId, strokes, bounds };
    })
    .filter((g): g is Group => g !== null)
    .sort((a, b) => (a.bounds.minY === b.bounds.minY ? a.bounds.minX - b.bounds.minX : a.bounds.minY - b.bounds.minY));

  if (groups.length === 0) return;

  const blockers: Bounds[] = [...sceneBlockers, ...groupedBoundsByElementId(inlineBlockingStrokes)];
  for (const group of groups) {
    let requiredDy = 0;
    for (const blocker of blockers) {
      const overlapX = horizontalOverlap(group.bounds, blocker);
      if (overlapX < 14) continue;
      const minGap = 14;
      const needed = blocker.maxY + minGap - (group.bounds.minY + requiredDy);
      if (needed > requiredDy) requiredDy = needed;
    }

    if (requiredDy > 0) shiftGroup(group, requiredDy);
    blockers.push(group.bounds);
  }
}
