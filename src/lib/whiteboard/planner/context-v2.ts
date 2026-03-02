import type {
  DrawBatch,
  DrawElement,
  SemanticBatch,
  StructuredWhiteboardContext,
  WhiteboardBounds,
} from '@/types/agent';
import { boundsOf } from '../bounds';

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

function defaultStructuredContext(): StructuredWhiteboardContext {
  return {
    scene_summary: {
      element_count: 0,
      type_counts: {},
    },
    occupied_regions: [],
    anchors: [],
    recent_blocks: [],
    suggested_next_regions: [
      { name: 'below_full', x: 64, y: 96, w: 1320, h: 420, score: 1 },
      { name: 'below_left', x: 64, y: 96, w: 620, h: 420, score: 0.92 },
      { name: 'below_right', x: 764, y: 96, w: 620, h: 420, score: 0.88 },
    ],
    token_budget_hint: {
      max_chars: 2200,
    },
  };
}

function deriveSuggestedRegions(bounds: WhiteboardBounds | undefined): StructuredWhiteboardContext['suggested_next_regions'] {
  const suggestedY = bounds ? bounds.maxY + 72 : 96;
  const suggestedX = bounds ? Math.max(56, bounds.minX + 8) : 64;
  return [
    { name: 'below_full', x: suggestedX, y: suggestedY, w: 1320, h: 420, score: 1 },
    { name: 'below_left', x: suggestedX, y: suggestedY, w: 620, h: 420, score: 0.92 },
    { name: 'below_right', x: suggestedX + 700, y: suggestedY, w: 620, h: 420, score: 0.88 },
  ];
}

function recentBlocksFromSemanticBatch(batch: SemanticBatch): StructuredWhiteboardContext['recent_blocks'] {
  return batch.blocks
    .slice(0, 4)
    .map((block) => {
      if (block.kind === 'caption') {
        return {
          id: `${batch.batch_id}:${block.id}`,
          kind: block.kind,
          region: block.region_hint ?? 'auto',
          text_preview: block.text.slice(0, 80),
        };
      }

      if (block.kind === 'equation_stack') {
        return {
          id: `${batch.batch_id}:${block.id}`,
          kind: block.kind,
          region: block.region_hint ?? 'auto',
          text_preview: block.lines[0]?.tex?.replace(/\s+/g, ' ').slice(0, 80),
        };
      }

      return {
        id: `${batch.batch_id}:${block.id}`,
        kind: block.kind,
        region: block.region_hint ?? 'auto',
        text_preview: block.title?.slice(0, 80),
      };
    })
    .filter((block) => Boolean(block.text_preview));
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

export function extendStructuredWhiteboardContext(
  context: StructuredWhiteboardContext | undefined,
  batch: DrawBatch,
  semanticBatch?: SemanticBatch,
): StructuredWhiteboardContext {
  const base = context
    ? {
        scene_summary: {
          element_count: context.scene_summary.element_count,
          bounds: context.scene_summary.bounds ? { ...context.scene_summary.bounds } : undefined,
          type_counts: { ...context.scene_summary.type_counts },
        },
        occupied_regions: [...context.occupied_regions],
        anchors: [...context.anchors],
        recent_blocks: [...context.recent_blocks],
        suggested_next_regions: [...context.suggested_next_regions],
        token_budget_hint: { ...context.token_budget_hint },
      }
    : defaultStructuredContext();

  const hasClear = batch.elements.some((el) => el.type === 'clear');
  if (hasClear) {
    base.scene_summary.element_count = 0;
    base.scene_summary.bounds = undefined;
    base.scene_summary.type_counts = {};
    base.occupied_regions = [];
    base.anchors = [];
    base.recent_blocks = [];
  }

  let mergedBounds = base.scene_summary.bounds ? { ...base.scene_summary.bounds } : undefined;
  const appendedRecent: StructuredWhiteboardContext['recent_blocks'] = [];

  for (const el of batch.elements) {
    if (el.type === 'clear') continue;
    base.scene_summary.element_count += 1;
    base.scene_summary.type_counts[el.type] = (base.scene_summary.type_counts[el.type] ?? 0) + 1;

    const b = boundsOf(el);
    mergedBounds = mergeBounds(mergedBounds, b);
    if (b) {
      base.occupied_regions.push({
        id: `${batch.batch_id}:${el.id}`,
        x: b.minX,
        y: b.minY,
        w: Math.max(0, b.maxX - b.minX),
        h: Math.max(0, b.maxY - b.minY),
        semantic_kind: el.type,
        priority: el.type === 'latex' ? 9 : el.type === 'text' ? 8 : 6,
      });
    }

    if (el.type === 'line' || el.type === 'arrow') {
      base.anchors.push({ id: `${el.id}-from`, x: el.from.x, y: el.from.y, role: 'endpoint_from' });
      base.anchors.push({ id: `${el.id}-to`, x: el.to.x, y: el.to.y, role: 'endpoint_to' });
    } else if (el.type === 'rect') {
      base.anchors.push({ id: `${el.id}-center`, x: el.x + el.w / 2, y: el.y + el.h / 2, role: 'shape_center' });
    }

    const preview = textPreview(el);
    if (preview) {
      appendedRecent.push({
        id: `${batch.batch_id}:${el.id}`,
        kind: el.type,
        region: 'auto',
        text_preview: preview,
      });
    }
  }

  if (semanticBatch) {
    appendedRecent.push(...recentBlocksFromSemanticBatch(semanticBatch));
  }

  base.scene_summary.bounds = mergedBounds;
  base.suggested_next_regions = deriveSuggestedRegions(mergedBounds);
  base.occupied_regions = base.occupied_regions.slice(-60);
  base.anchors = base.anchors.slice(-80);
  base.recent_blocks = [...base.recent_blocks, ...appendedRecent].slice(-20);
  if (!base.token_budget_hint?.max_chars) {
    base.token_budget_hint = { max_chars: 2200 };
  }

  return base;
}
