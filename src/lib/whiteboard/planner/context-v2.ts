import type {
  DrawElement,
  SemanticBatch,
  StructuredWhiteboardContext,
  WhiteboardBounds,
} from '@/types/agent';

function boundsOf(el: DrawElement): WhiteboardBounds | null {
  if (el.type === 'rect') {
    return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
  }
  if (el.type === 'ellipse') {
    return { minX: el.cx - el.rx, minY: el.cy - el.ry, maxX: el.cx + el.rx, maxY: el.cy + el.ry };
  }
  if (el.type === 'line' || el.type === 'arrow') {
    return {
      minX: Math.min(el.from.x, el.to.x),
      minY: Math.min(el.from.y, el.to.y),
      maxX: Math.max(el.from.x, el.to.x),
      maxY: Math.max(el.from.y, el.to.y),
    };
  }
  if (el.type === 'text') {
    const size = el.size ?? 18;
    const width = Math.max(size * 0.45, el.text.length * size * 0.52);
    return { minX: el.x, minY: el.y - size * 0.9, maxX: el.x + width, maxY: el.y + size * 0.5 };
  }
  if (el.type === 'latex') {
    const size = el.fontSize ?? 20;
    const width = Math.max(size * 1.2, el.tex.length * size * 0.5);
    const height = size * (el.displayMode ? 2.1 : 1.5);
    return { minX: el.x, minY: el.y - size * 0.9, maxX: el.x + width, maxY: el.y + height };
  }
  return null;
}

function mergeBounds(a: WhiteboardBounds | undefined, b: WhiteboardBounds | null): WhiteboardBounds | undefined {
  if (!b) return a;
  if (!a) return { ...b };
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function textPreview(el: DrawElement): string | undefined {
  if (el.type === 'text') return el.text.replace(/\s+/g, ' ').slice(0, 80);
  if (el.type === 'latex') return el.tex.replace(/\s+/g, ' ').slice(0, 80);
  return undefined;
}

export function buildStructuredWhiteboardContext(
  elements: DrawElement[],
  semanticScene: SemanticBatch[] = [],
): StructuredWhiteboardContext {
  const typeCounts: StructuredWhiteboardContext['scene_summary']['type_counts'] = {};
  const occupiedRegions: StructuredWhiteboardContext['occupied_regions'] = [];
  const anchors: StructuredWhiteboardContext['anchors'] = [];

  let sceneBounds: WhiteboardBounds | undefined;
  for (const el of elements) {
    typeCounts[el.type] = (typeCounts[el.type] ?? 0) + 1;
    const b = boundsOf(el);
    sceneBounds = mergeBounds(sceneBounds, b);

    if (b) {
      occupiedRegions.push({
        id: el.id,
        x: b.minX,
        y: b.minY,
        w: Math.max(0, b.maxX - b.minX),
        h: Math.max(0, b.maxY - b.minY),
        semantic_kind: el.type,
        priority: el.type === 'latex' ? 9 : el.type === 'text' ? 8 : 6,
      });
    }

    if (el.type === 'line' || el.type === 'arrow') {
      anchors.push({ id: `${el.id}-from`, x: el.from.x, y: el.from.y, role: 'endpoint_from' });
      anchors.push({ id: `${el.id}-to`, x: el.to.x, y: el.to.y, role: 'endpoint_to' });
    }
    if (el.type === 'rect') {
      anchors.push({ id: `${el.id}-center`, x: el.x + el.w / 2, y: el.y + el.h / 2, role: 'shape_center' });
    }
  }

  const recentFromSemantic = semanticScene
    .slice(-8)
    .map((batch) => ({
      id: batch.batch_id,
      kind: batch.template,
      region: 'auto',
      text_preview: batch.blocks[0] && 'text' in batch.blocks[0] ? batch.blocks[0].text.slice(0, 80) : undefined,
    }));

  const recentFromElements = elements
    .slice(-10)
    .map((el) => ({
      id: el.id,
      kind: el.type,
      region: 'auto',
      text_preview: textPreview(el),
    }));

  const recentBlocks = (recentFromSemantic.length > 0 ? recentFromSemantic : recentFromElements).slice(-10);

  const suggestedY = sceneBounds ? sceneBounds.maxY + 72 : 96;
  const suggestedX = sceneBounds ? Math.max(56, sceneBounds.minX + 8) : 64;

  const suggestedRegions: StructuredWhiteboardContext['suggested_next_regions'] = [
    { name: 'below_full', x: suggestedX, y: suggestedY, w: 1320, h: 420, score: 1 },
    { name: 'below_left', x: suggestedX, y: suggestedY, w: 620, h: 420, score: 0.92 },
    { name: 'below_right', x: suggestedX + 700, y: suggestedY, w: 620, h: 420, score: 0.88 },
  ];

  return {
    scene_summary: {
      element_count: elements.length,
      bounds: sceneBounds,
      type_counts: typeCounts,
    },
    occupied_regions: occupiedRegions.slice(-60),
    anchors: anchors.slice(-80),
    recent_blocks: recentBlocks,
    suggested_next_regions: suggestedRegions,
    token_budget_hint: {
      max_chars: 2200,
    },
  };
}
