import type { Point, DrawBatch, AgentSSEEvent } from '@/types/agent';

export interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function expectPointsFinite(points: Point[]): void {
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new Error(
        `Point at index ${i} has non-finite coordinates: (${p.x}, ${p.y})`,
      );
    }
  }
}

export function expectBoundsContain(
  bounds: StrokeBounds,
  point: Point,
): void {
  if (
    point.x < bounds.minX ||
    point.x > bounds.maxX ||
    point.y < bounds.minY ||
    point.y > bounds.maxY
  ) {
    throw new Error(
      `Point (${point.x}, ${point.y}) is outside bounds [${bounds.minX},${bounds.minY}]-[${bounds.maxX},${bounds.maxY}]`,
    );
  }
}

export function expectBoundsOverlap(a: StrokeBounds, b: StrokeBounds): void {
  if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) {
    throw new Error(
      `Bounds [${a.minX},${a.minY}]-[${a.maxX},${a.maxY}] and [${b.minX},${b.minY}]-[${b.maxX},${b.maxY}] do not overlap`,
    );
  }
}

export function expectValidDrawBatch(batch: DrawBatch): void {
  if (!batch.batch_id) {
    throw new Error('DrawBatch must have a batch_id');
  }
  if (!Array.isArray(batch.elements) || batch.elements.length === 0) {
    throw new Error('DrawBatch must have at least one element');
  }
  for (const el of batch.elements) {
    if (!el.id || !el.type) {
      throw new Error('Each DrawElement must have an id and type');
    }
  }
}

export function expectValidSSEEvent(event: unknown): void {
  if (typeof event !== 'object' || event === null) {
    throw new Error('SSE event must be a non-null object');
  }
  const e = event as Record<string, unknown>;
  if (typeof e.type !== 'string') {
    throw new Error('SSE event must have a string "type" field');
  }
  if (typeof e.turnId !== 'string') {
    throw new Error('SSE event must have a string "turnId" field');
  }
  const validTypes = [
    'assistant.text.delta',
    'assistant.text.done',
    'whiteboard.batch',
    'whiteboard.layout.diagnostics',
    'warning',
    'error',
    'turn.done',
  ];
  if (!validTypes.includes(e.type)) {
    throw new Error(`Unknown SSE event type: ${e.type}`);
  }
}
