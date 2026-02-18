/**
 * ToolResultBuilder — computes compact tool_result payloads from
 * committed draw operations for feeding back to the LLM.
 */

import type { DrawElement, BoundingBox } from '@/types';

// ── Result types ────────────────────────────────────────────────────

export interface ToolResult {
  readonly elements_count: number;
  readonly bbox: BoundingBox | null;
  readonly last_ids: readonly string[];
  readonly summary: string;
}

// ── Bounding box ────────────────────────────────────────────────────

function elementBounds(el: DrawElement): BoundingBox {
  switch (el.type) {
    case 'rect':
    case 'text':
    case 'image':
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    case 'ellipse':
      return { x: el.x - el.rx, y: el.y - el.ry, w: el.rx * 2, h: el.ry * 2 };
    case 'line':
    case 'arrow':
    case 'freehand': {
      const pts = el.points;
      if (pts.length === 0) return { x: el.x, y: el.y, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: el.x + minX, y: el.y + minY, w: maxX - minX, h: maxY - minY };
    }
  }
}

export function computeBoundingBox(elements: readonly DrawElement[]): BoundingBox | null {
  if (elements.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const b = elementBounds(el);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ── ID extraction ───────────────────────────────────────────────────

export function extractIds(elements: readonly DrawElement[]): string[] {
  return elements.map((el) => el.id);
}

// ── Summary generation ──────────────────────────────────────────────

export function generateStepSummary(
  opsApplied: number,
  elementTypes: readonly string[],
): string {
  const typeCounts = new Map<string, number>();
  for (const t of elementTypes) {
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const parts = Array.from(typeCounts.entries())
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');
  return `Applied ${opsApplied} ops → ${parts || 'no elements'}`;
}

// ── Build result ────────────────────────────────────────────────────

export function buildToolResult(
  elements: readonly DrawElement[],
  opsApplied: number,
): ToolResult {
  const ids = extractIds(elements);
  const lastIds = ids.slice(-5);
  const bbox = computeBoundingBox(elements);
  const types = elements.map((el) => el.type);
  const summary = generateStepSummary(opsApplied, types);
  return { elements_count: elements.length, bbox, last_ids: lastIds, summary };
}
